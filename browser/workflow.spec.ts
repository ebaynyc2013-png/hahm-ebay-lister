import { test, expect, Page } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
  "base64",
);
async function setup(page: Page) {
  await page.route("**/api/ebay/status", (r) =>
    r.fulfill({ json: { connected: true } }),
  );
  await page.route("**/api/models", (r) =>
    r.fulfill({ json: { sortModels: [], analysisModels: [] } }),
  );
  await page.route("**/api/analyze", (r) =>
    r.fulfill({
      json: {
        ok: true,
        listing: {
          title: "Canon R5 Camera",
          description: "Visible scuff. Untested.",
          brand: "Canon",
          item_type: "Camera",
          condition: "GOOD",
          suggested_price: 200,
          item_specifics: { Brand: "Canon", Model: "R5" },
        },
        usage: [],
      },
    }),
  );
  await page.route("**/api/ebay/prepare", (r) => {
    const l = r.request().postDataJSON().listing;
    return r.fulfill({
      json: {
        ok: true,
        listing: { ...l, category_id: "625", ebay_condition: "" },
        preparation: {
          categoryId: "625",
          categoryName: "Cameras",
          aspects: [
            {
              name: "Brand",
              required: true,
              usage: "REQUIRED",
              mode: "FREE_TEXT",
              cardinality: "SINGLE",
              values: [],
            },
          ],
          conditions: [{ value: "USED_EXCELLENT", label: "Used" }],
          expiresAt: Date.now() + 3600000,
          signature: "test",
          issues: [],
        },
      },
    });
  });
  await page.route("**/api/ebay/comps", (r) =>
    r.fulfill({ json: { ok: false, error: "Research unavailable" } }),
  );
  await page.route("**/api/ebay/options", (r) =>
    r.fulfill({
      json: {
        ok: true,
        options: {
          fulfillment: [{ id: "ship", name: "My shipping" }],
          payment: [{ id: "pay", name: "My payment" }],
          returns: [{ id: "ret", name: "My returns" }],
          locations: [{ id: "home", name: "My real origin" }],
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Restoring saved work…")).toBeHidden();
}
async function draft(page: Page) {
  await page.locator("input[type=file]").setInputFiles([
    { name: "front.png", mimeType: "image/png", buffer: png },
    { name: "label.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.locator(".thumb")).toHaveCount(2);
  await page.getByRole("button", { name: "These photos are one item" }).click();
  await page.getByRole("button", { name: /Write.*listing/i }).click();
  await expect(page.getByText("Cameras", { exact: true })).toBeVisible();
}
async function shipping(page: Page) {
  await expect(
    page.getByRole("button", { name: "Post this to eBay" }),
  ).toBeDisabled();
  await page
    .getByLabel("eBay condition", { exact: true })
    .selectOption("USED_EXCELLENT");
  await page
    .getByRole("button", { name: "Load my eBay policies and locations" })
    .click();
  await page
    .getByLabel("Shipping policy", { exact: true })
    .selectOption("ship");
  await page.getByLabel("Payment policy", { exact: true }).selectOption("pay");
  await page.getByLabel("Return policy", { exact: true }).selectOption("ret");
  await page
    .getByLabel("Shipping origin", { exact: true })
    .selectOption("home");
  await page
    .getByText("Package weight and dimensions (optional)", { exact: true })
    .click();
  for (const [label, value] of [
    ["Packed weight (oz)", "24"],
    ["Length (in)", "10"],
    ["Width (in)", "8"],
    ["Height (in)", "6"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
}
test("retains good photos when one cannot decode; preserves original blobs across reload", async ({
  page,
}) => {
  await setup(page);
  await page.locator("input[type=file]").setInputFiles([
    { name: "valid.png", mimeType: "image/png", buffer: png },
    { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("bad") },
  ]);
  await expect(page.locator(".thumb")).toHaveCount(1);
  await expect(page.locator(".note-error")).toContainText("broken.png");
  await expect(page.getByRole("status")).toContainText("Saved on this device");
  await page.reload();
  await expect(page.locator(".thumb")).toHaveCount(1);
});
test("restores edited drafts and blocks publication with missing facts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await draft(page);
  await page.locator(".title-input").fill("Seller reviewed camera");
  await page.getByLabel("Brand", { exact: true }).fill("");
  await expect(
    page.getByRole("button", { name: "Post this to eBay" }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Saved on this device");
  await page.reload();
  await expect(page.locator(".title-input")).toHaveValue(
    "Seller reviewed camera",
  );
  await expect(page.getByLabel("Brand", { exact: true })).toHaveValue("");
  expect(errors).toEqual([]);
});
test("partial image upload stops publication; retry preserves reviewed fields", async ({
  page,
}) => {
  let calls = 0;
  let fail = true;
  await setup(page);
  await page.route("**/api/ebay/upload-photos", (r) =>
    r.fulfill({
      json: {
        ok: true,
        urls: fail
          ? ["https://i.ebayimg.com/1.jpg"]
          : ["https://i.ebayimg.com/1.jpg", "https://i.ebayimg.com/2.jpg"],
      },
    }),
  );
  await page.route("**/api/ebay/publish", (r) => {
    calls++;
    const b = r.request().postDataJSON();
    expect(b.listing.title).toBe("Canon R5 Camera");
    expect(b.shipping.weightOz).toBe(24);
    expect(b.expectedPhotoCount).toBe(2);
    return r.fulfill({ json: { success: true, listingId: "12345" } });
  });
  await draft(page);
  await shipping(page);
  await page.getByRole("button", { name: "Post this to eBay" }).click();
  await expect(
    page.getByText(/Some selected photos failed to upload/),
  ).toBeVisible();
  expect(calls).toBe(0);
  fail = false;
  await page.getByRole("button", { name: "Post this to eBay" }).click();
  await expect(
    page.getByText("Posted to eBay", { exact: false }),
  ).toBeVisible();
  expect(calls).toBe(1);
});
test("second tab cannot overwrite the active workspace", async ({
  page,
  context,
}) => {
  await setup(page);
  await expect(page.getByText("Saved on this device")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText(/already open in another tab/)).toBeVisible();
  await other.close();
});

test("late preparation never overwrites a seller edit", async ({ page }) => {
  await setup(page);
  await draft(page);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let started!: () => void;
  const called = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/ebay/prepare", async (r) => {
    started();
    await pending;
    await r.fulfill({
      json: {
        ok: true,
        listing: {
          ...r.request().postDataJSON().listing,
          title: "Stale AI response",
        },
        preparation: {},
      },
    });
  });
  await page
    .getByRole("button", { name: "Prepare category and specifics" })
    .click();
  await called;
  await page.locator(".title-input").fill("My newer correction");
  finish();
  await expect(
    page.getByText(
      "The draft changed while preparing. Prepare it again to keep your edits.",
    ),
  ).toBeVisible();
  await expect(page.locator(".title-input")).toHaveValue("My newer correction");
});
test("phone review fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await draft(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/phone-review.png",
    fullPage: true,
  });
});

test("eBay sign-in uses an in-page access form and a user-clicked link", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.prompt = () => {
      throw new Error("prompt() is not supported.");
    };
    window.open = () => {
      throw new Error("Automatic popups are not supported.");
    };
  });
  await setup(page);
  await page.route("**/api/ebay/status", (r) =>
    r.fulfill({ json: { configured: true, connected: false } }),
  );
  await page.route("**/api/ebay/auth", (r) => {
    const valid = r.request().headers()["x-app-secret"] === "test-correct-code";
    return r.fulfill({
      status: valid ? 200 : 401,
      json: valid
        ? { ok: true, url: "https://auth.ebay.com/oauth2/authorize?test=1" }
        : { ok: false, code: "ACCESS_CODE_REQUIRED" },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Open eBay" }).click();
  const dialog = page.getByRole("dialog", { name: "App access code" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("input")).toHaveAttribute("type", "password");
  await dialog.locator("input").fill("wrong-code");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).toContainText("try again");
  await dialog.locator("input").fill("test-correct-code");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Continue to eBay" }),
  ).toHaveAttribute("href", "https://auth.ebay.com/oauth2/authorize?test=1");
});

test("cancelling access entry closes the form and allows another attempt", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/ebay/status", (r) =>
    r.fulfill({ json: { configured: true, connected: false } }),
  );
  await page.route("**/api/ebay/auth", (r) =>
    r.fulfill({
      status: 401,
      json: {
        ok: false,
        code: "ACCESS_CODE_REQUIRED",
        error: "Access code required.",
      },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Open eBay" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Open eBay" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("defaults the seller policies and allows review without package measurements", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/ebay/options", (r) =>
    r.fulfill({
      json: {
        ok: true,
        options: {
          fulfillment: [
            {
              id: "usual",
              name: "USPS Ground Advantage ($7.95), 2 day handling",
            },
            { id: "heavy", name: "$9.95" },
          ],
          payment: [{ id: "pay", name: "Managed Payments" }],
          returns: [
            { id: "ret", name: "Returns Accepted,Seller,30 Days,Money Back#1" },
          ],
          locations: [
            { id: "home", name: "Hustle at Home Mom HQ · 84095 · US" },
          ],
        },
      },
    }),
  );
  await draft(page);
  await expect(page.getByLabel("Shipping policy", { exact: true })).toHaveValue(
    "usual",
  );
  await expect(page.getByLabel("Shipping origin", { exact: true })).toHaveValue(
    "home",
  );
  await page
    .getByLabel("eBay condition", { exact: true })
    .selectOption("USED_EXCELLENT");
  await expect(
    page.getByRole("button", { name: "Post this to eBay" }),
  ).toBeEnabled();
  await page
    .getByLabel("Shipping policy", { exact: true })
    .selectOption("heavy");
  await page
    .getByRole("button", { name: "Load my eBay policies and locations" })
    .click();
  await expect(page.getByLabel("Shipping policy", { exact: true })).toHaveValue(
    "heavy",
  );
});

test("shows the AI's category with alternates; tapping one refills that category's fields", async ({
  page,
}) => {
  const sent: any[] = [];
  await setup(page);
  const paths: Record<string, string> = {
    "551": "Art > Paintings",
    "554": "Art > Mixed Media Art & Collage Art",
  };
  await page.route("**/api/ebay/prepare", (r) => {
    const l = r.request().postDataJSON().listing;
    sent.push(l);
    const searched = !l.category_id;
    const id = l.category_id || "551";
    return r.fulfill({
      json: {
        ok: true,
        listing: {
          ...l,
          category_id: id,
          category_path: paths[id],
          ebay_condition: "",
          // What this category's fill would add on top.
          item_specifics: {
            ...l.item_specifics,
            Type: id === "551" ? "Painting" : "Collage",
          },
        },
        preparation: {
          categoryId: id,
          categoryName: paths[id],
          aspects: [],
          conditions: [{ value: "USED_EXCELLENT", label: "Used" }],
          expiresAt: Date.now() + 3600000,
          signature: "test",
          issues: [],
          // Only the Prepare that searched carries the AI's choice.
          ...(searched
            ? {
                categoryChoices: {
                  aiPick: "551",
                  options: [
                    { id: "551", path: paths["551"], warning: "" },
                    {
                      id: "554",
                      path: paths["554"],
                      warning:
                        "Type offers only Assemblage, Collage, Mosaic — none is a painting",
                    },
                  ],
                  reason: "A resin painting on canvas.",
                  confidence: "high",
                },
              }
            : {}),
        },
      },
    });
  });
  await page.locator("input[type=file]").setInputFiles([
    { name: "front.png", mimeType: "image/png", buffer: png },
    { name: "back.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.locator(".thumb")).toHaveCount(2);
  await page.getByRole("button", { name: "These photos are one item" }).click();
  await page.getByRole("button", { name: /Write.*listing/i }).click();

  const group = page.getByRole("radiogroup", { name: "Category" });
  await expect(group).toBeVisible();
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.nth(0)).toBeChecked();
  await expect(group).toContainText("Art > Paintings (551)");
  await expect(group).toContainText("AI’s choice");
  await expect(group).toContainText("none is a painting");
  await expect(group).toContainText("A resin painting on canvas.");
  await page.screenshot({ path: "test-results/category-choices.png", fullPage: true });

  // Tap the alternate: the fields are filled again for it, from the first draft.
  await group.getByText("Art > Mixed Media Art & Collage Art").click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].category_id).toBe("554");
  expect(sent[1].category_path).toBe(paths["554"]);
  expect(sent[1].item_specifics).toEqual({ Brand: "Canon", Model: "R5" });
  await expect(radios.nth(1)).toBeChecked();
  await expect(page.getByLabel("Category ID", { exact: true })).toHaveValue("554");

  // A later Prepare keeps the choices on the card.
  await page.getByRole("button", { name: "Prepare category and specifics" }).click();
  await expect.poll(() => sent.length).toBe(3);
  await expect(radios).toHaveCount(2);

  // And back again.
  await group.getByText("Art > Paintings").click();
  await expect.poll(() => sent.length).toBe(4);
  expect(sent[3].category_id).toBe("551");
  await expect(radios.nth(0)).toBeChecked();
});

test("a written card survives the next batch in History and returns to work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await draft(page);
  await expect(page.locator(".title-input")).toHaveValue("Canon R5 Camera");
  await page.locator(".title-input").fill("Canon R5 Camera Body");

  // Start the next item: the work screen is replaced by the new batch.
  await page.getByRole("button", { name: "← Back to items" }).click();
  await page.getByRole("button", { name: "← Back to photos" }).click();
  await page.getByRole("button", { name: "These photos are one item" }).click();
  await expect(page.locator(".title-input")).toHaveCount(0);

  const history = page.getByRole("region", { name: "History" });
  await expect(history).toContainText("History — 1 saved card");
  await history.locator("summary").click();
  await expect(history).toContainText("Canon R5 Camera Body");
  await expect(history).toContainText("Not published yet");

  // It is kept on this computer: still there after a reload.
  await page.reload();
  await expect(page.getByRole("region", { name: "History" })).toContainText(
    "History — 1 saved card",
  );

  // Back to work, with the seller's edit and its photos.
  await page.getByRole("region", { name: "History" }).locator("summary").click();
  await page.getByRole("button", { name: "↩ Return to work" }).click();
  await expect(page.locator(".title-input")).toHaveValue("Canon R5 Camera Body");
  await expect(page.getByRole("region", { name: "History" })).toHaveCount(0);

  // Deleting from History asks first, in the page.
  await page.getByRole("button", { name: "← Back to items" }).click();
  await page.getByRole("button", { name: "← Back to photos" }).click();
  await page.getByRole("button", { name: "These photos are one item" }).click();
  const again = page.getByRole("region", { name: "History" });
  await again.locator("summary").click();
  await again.getByRole("button", { name: "Delete" }).click();
  await expect(again).toContainText("Delete this card from History for good?");
  await again.getByRole("button", { name: "Keep it" }).click();
  await expect(again).toContainText("Canon R5 Camera Body");
  await again.getByRole("button", { name: "Delete" }).click();
  await again.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("region", { name: "History" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a card returned from History a day later gets a fresh category check at no AI cost", async ({
  page,
}) => {
  await page.clock.install();
  await setup(page);
  await draft(page);
  await page.getByRole("button", { name: "← Back to items" }).click();
  await page.getByRole("button", { name: "← Back to photos" }).click();
  await page.getByRole("button", { name: "These photos are one item" }).click();
  await expect(page.getByRole("region", { name: "History" })).toBeVisible();

  const sent: any[] = [];
  await page.route("**/api/ebay/prepare", (r) => {
    const b = r.request().postDataJSON();
    sent.push(b);
    return r.fulfill({
      json: {
        ok: true,
        listing: b.listing,
        preparation: {
          categoryId: b.listing.category_id,
          categoryName: "Cameras",
          aspects: [],
          conditions: [{ value: "USED_EXCELLENT", label: "Used" }],
          expiresAt: Date.now() + 3600000,
          signature: "fresh",
          issues: [],
        },
      },
    });
  });
  await page.clock.fastForward("25:00:00");
  const history = page.getByRole("region", { name: "History" });
  await history.locator("summary").click();
  await history.getByRole("button", { name: "↩ Return to work" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].enrich).toBe(false);
  expect(sent[0].images).toEqual([]);
  expect(sent[0].listing.category_id).toBe("625");
  await expect(page.locator(".title-input")).toHaveValue("Canon R5 Camera");
});

test("History fits a phone screen", async ({ page }) => {
  await setup(page);
  await draft(page);
  await page.getByRole("button", { name: "← Back to items" }).click();
  await page.getByRole("button", { name: "← Back to photos" }).click();
  await page.getByRole("button", { name: "These photos are one item" }).click();
  const history = page.getByRole("region", { name: "History" });
  await history.locator("summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await history.screenshot({ path: "test-results/history-phone.png" });
});

test("a website seen in the photos is shown as a warning, never in the listing", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/analyze", (r) =>
    r.fulfill({
      json: {
        ok: true,
        listing: {
          title: "Colie Bloom Resin Geode Painting",
          description: "Colie Bloom Resin Geode Painting\n\nHallmarks: label reads Colie Bloom.",
          brand: "Colie Bloom",
          item_type: "Painting",
          condition: "EXCELLENT",
          suggested_price: 120,
          contact_seen: ["Photo 3: a website address on the artist's label"],
        },
        usage: [],
      },
    }),
  );
  await draft(page);
  const warning = page.getByRole("alert").filter({ hasText: "Contact details are visible" });
  await expect(warning).toContainText("Photo 3: a website address on the artist's label");
  await expect(warning).toContainText("crop or remove that photo");
});

test("the description shows its length, and tags for other shops sit apart from it", async ({
  page,
}) => {
  await setup(page);
  const description =
    "Gold Cord Pendant Necklace\n\nBrand: Premier Designs\n\nCondition: Very good.\n\nActual Measurements:\n• Length: 18 in";
  await page.route("**/api/analyze", (r) =>
    r.fulfill({
      json: {
        ok: true,
        listing: {
          title: "Gold Cord Pendant Necklace",
          description,
          description_dropped: ["Occasion"],
          brand: "Premier Designs",
          item_type: "Necklace",
          condition: "VERY_GOOD",
          suggested_price: 25,
          hashtags: ["#goldnecklace", "#cordnecklace", "#bohojewelry"],
          etsy_tags: ["gold cord necklace", "boho necklace", "gift for her"],
        },
        usage: [],
      },
    }),
  );
  await draft(page);
  await expect(page.getByText(`${description.length}/800`)).toBeVisible();
  await expect(page.getByText("Left out to fit 800 characters: Occasion.")).toBeVisible();
  const tags = page.getByRole("region", { name: "Tags for other shops" });
  await expect(tags).toContainText("#goldnecklace #cordnecklace #bohojewelry");
  await expect(tags).toContainText("Mercari takes the first 3");
  await expect(tags).toContainText("Etsy · 3 of 13");
  await expect(tags).toContainText("gold cord necklace, boho necklace, gift for her");
  await expect(tags.getByRole("button", { name: "📋 Copy Etsy tags" })).toBeVisible();
  // Never part of what eBay receives.
  await expect(page.locator("textarea").first()).not.toHaveValue(/#goldnecklace/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await tags.screenshot({ path: "test-results/other-shops-phone.png" });
});
