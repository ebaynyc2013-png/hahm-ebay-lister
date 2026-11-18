import { describe, expect, it, vi } from "vitest";
import {
  baselineOf,
  cardChanges,
  itemKind,
  needsRules,
  ruleLine,
  rulesFor,
  sellerRulesSchema,
  type SellerRule,
} from "@/lib/learn-diff";
import { cleanRules, learnMessage, sellerRulesText, WRITING_RULES_INTRO, MAX_NEW_RULES } from "@/lib/learn";
import { categoriesFor, rulesToSend, typeKey, type CategoryMemory, type StoredRule } from "@/lib/listing-memory";
import { reviseMessage } from "@/lib/revise";
import { buildAnalysisParams, readAnalyzeBody, toImageBlocks } from "@/lib/analyze-core";
import { rememberedText, withRemembered } from "@/lib/ebay/categorySelect";
import type { ListingResult } from "@/lib/types";

// The program learns from the seller's corrections (her wish, 18 Nov 2026).

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

const written: ListingResult = {
  title: "Stunning Garnet Sterling Silver Ring Size 7",
  description: "Stunning Garnet Sterling Silver Ring Size 7\n\nA stunning ring.",
  item_specifics: { Metal: "Sterling Silver", "Main Stone": "Garnet", Style: "Cocktail" },
  category_id: "164343",
  category_path: "Jewelry & Watches > Fine Jewelry > Rings",
  item_type: "Ring",
} as ListingResult;

describe("what she changed", () => {
  it("finds nothing when she changed nothing", () => {
    expect(cardChanges(baselineOf(written), { ...written })).toBeNull();
    // Spaces alone are not a change.
    expect(cardChanges(baselineOf(written), { ...written, title: `${written.title}  ` })).toBeNull();
  });

  it("finds her title, description and item specifics edits", () => {
    const hers = {
      ...written,
      title: "Sterling Silver Garnet Ring Size 7",
      description: "Sterling Silver Garnet Ring Size 7\n\nA lovely ring.",
      item_specifics: { ...written.item_specifics, Style: "Solitaire", Theme: "Vintage" },
    };
    const c = cardChanges(baselineOf(written), hers)!;
    expect(c.title).toEqual({ before: written.title, after: hers.title });
    expect(c.description?.after).toContain("lovely");
    expect(c.specifics).toEqual([
      { name: "Style", before: "Cocktail", after: "Solitaire" },
      { name: "Theme", before: "", after: "Vintage" },
    ]);
    expect(c.category).toBeUndefined();
    expect(needsRules(c)).toBe(true);
  });

  it("finds a new category, which needs no AI", () => {
    const moved = {
      ...written,
      category_id: "10985",
      category_path: "Jewelry & Watches > Vintage & Antique Jewelry > Costume > Rings",
    };
    const c = cardChanges(baselineOf(written), moved)!;
    expect(c.category?.id).toBe("10985");
    expect(needsRules(c)).toBe(false);
  });
});

describe("a rule stays with its kind of item (her choice: similar items only)", () => {
  it("tells the kinds apart by eBay's category", () => {
    expect(itemKind("Jewelry & Watches > Fashion Jewelry > Earrings")).toBe("jewelry");
    expect(itemKind("Clothing, Shoes & Accessories > Women > Women's Shoes > Heels")).toBe("shoes");
    expect(itemKind("Clothing, Shoes & Accessories > Women > Women's Clothing > Dresses")).toBe("clothing");
    expect(itemKind("Clothing, Shoes & Accessories > Women > Women's Bags & Handbags")).toBe("bags");
    expect(itemKind("Cell Phones & Accessories > Cell Phones & Smartphones")).toBe("electronics");
    expect(itemKind("Home & Garden > Kitchen, Dining & Bar > Dinnerware")).toBe("home");
    expect(itemKind("Toys & Hobbies > Puzzles")).toBe("other");
    // No category yet: the item's own words.
    expect(itemKind("", { item_type: "Ring", title: "Silver Ring" })).toBe("jewelry");
  });

  it("sends a text update only this kind's rules", () => {
    const rules: SellerRule[] = [
      { kind: "jewelry", field: "title", rule: "Put the metal before the stone." },
      { kind: "clothing", field: "description", rule: "Give the fabric in percent." },
      { kind: "jewelry", field: "item_specifics", rule: "Prefer Style Solitaire for one stone." },
    ];
    expect(rulesFor(rules, "jewelry").map((r) => r.rule)).toEqual([
      "Put the metal before the stone.",
      "Prefer Style Solitaire for one stone.",
    ]);
    expect(rulesFor(rules, "jewelry", "item_specifics")).toHaveLength(1);
    const text = reviseMessage(written, "The stone is a garnet.", rulesFor(rules, "jewelry"));
    expect(text).toContain("Put the metal before the stone.");
    expect(text).not.toContain("fabric in percent");
    expect(text).toContain("Do NOT change anything else");
    // No rules: the update reads exactly as before.
    expect(reviseMessage(written, "x")).not.toContain("SELLER'S RULES");
  });

  it("labels every rule for the first writing, which only then learns the kind", () => {
    expect(ruleLine({ kind: "jewelry", field: "title", rule: "Put the metal first." })).toBe(
      "[Jewelry] Title: Put the metal first.",
    );
    const body = readAnalyzeBody({
      images: [{ mediaType: "image/png", data: PNG }],
      profile: "auto",
      sellerRules: [{ kind: "clothing", field: "description", rule: "Give the fabric in percent." }],
    });
    const p = buildAnalysisParams(body, "clothing", "claude-opus-4-8", toImageBlocks(body.images));
    const text = JSON.stringify(p.messages);
    expect(text).toContain("[Clothing] Description: Give the fabric in percent.");
    expect(text).toContain("follow ONLY the rules of the kind this item is");
    // A malformed set never sinks the writing.
    expect(readAnalyzeBody({ images: body.images, profile: "auto", sellerRules: "nonsense" }).sellerRules).toEqual([]);
    expect(sellerRulesText([], WRITING_RULES_INTRO)).toBe("");
  });
});

describe("the AI's rules are kept to their shape", () => {
  it("keeps at most four clean rules, of this kind, each once", () => {
    const raw = {
      rules: [
        { field: "title", rule: "Put the metal before the stone." },
        { field: "title", rule: "put the metal before the stone." },
        { field: "price", rule: "Ask more." },
        { field: "description", rule: "x" },
        { field: "description", rule: "Never write stunning." },
        { field: "description", rule: "Say lovely instead." },
        { field: "item_specifics", rule: "Prefer Solitaire." },
        { field: "description", rule: "One too many." },
      ],
    };
    const rules = cleanRules(raw, "jewelry");
    expect(rules).toHaveLength(MAX_NEW_RULES);
    expect(rules.every((r) => r.kind === "jewelry")).toBe(true);
    expect(rules.map((r) => r.rule)).not.toContain("Ask more.");
    expect(cleanRules({}, "jewelry")).toEqual([]);
  });

  it("shows the AI both versions, her notes and the rules she has", () => {
    const text = learnMessage({
      kind: "jewelry",
      item: "Ring",
      notes: "garnet, size 7",
      changes: {
        title: { before: "Stunning Ring", after: "Sterling Silver Garnet Ring" },
        specifics: [{ name: "Style", before: "Cocktail", after: "Solitaire" }],
      },
      known: ["[Jewelry] Title: Put the metal first."],
    });
    expect(text).toContain("Program: Stunning Ring");
    expect(text).toContain("Hers:    Sterling Silver Garnet Ring");
    expect(text).toContain('Style: "Cocktail" → "Solitaire"');
    expect(text).toContain("garnet, size 7");
    expect(text).toContain("[Jewelry] Title: Put the metal first.");
  });

  it("refuses a rule set that is not rules", () => {
    expect(sellerRulesSchema.safeParse([{ kind: "jewelry", field: "title", rule: "ok rule" }]).success).toBe(true);
    expect(sellerRulesSchema.safeParse([{ kind: "cars", field: "title", rule: "ok rule" }]).success).toBe(false);
  });
});

describe("the categories she chose before", () => {
  const memory: CategoryMemory[] = [
    { itemType: "clip earrings", kind: "jewelry", categoryId: "10985", categoryPath: "Jewelry & Watches > Vintage & Antique Jewelry > Costume > Earrings", savedAt: 2 },
    { itemType: "brooch", kind: "jewelry", categoryId: "50637", categoryPath: "Jewelry & Watches > Fashion Jewelry > Pins & Brooches", savedAt: 1 },
  ];

  it("finds the same kind of item, then one sharing its last word", () => {
    expect(typeKey("Clip-On Earrings!")).toBe("clip on earrings");
    expect(categoriesFor(memory, "Clip Earrings").map((c) => c.categoryId)).toEqual(["10985"]);
    // "stud earrings" shares "earrings": offered, and the AI decides.
    expect(categoriesFor(memory, "Stud Earrings").map((c) => c.categoryId)).toEqual(["10985"]);
    expect(categoriesFor(memory, "Necklace")).toEqual([]);
    expect(categoriesFor(memory, undefined)).toEqual([]);
  });

  it("offers her category even when eBay's search did not return it", () => {
    const remembered = categoriesFor(memory, "clip earrings");
    const list = withRemembered([{ id: "50647", name: "Earrings", path: "Jewelry & Watches > Fashion Jewelry > Earrings" }], remembered);
    expect(list[0]).toEqual({ id: "10985", name: "Earrings", path: remembered[0].categoryPath });
    expect(list).toHaveLength(2);
    // Already among eBay's: not added twice.
    expect(withRemembered(list, remembered)).toHaveLength(2);
    expect(rememberedText(remembered)).toContain("THE SELLER'S EARLIER CHOICE");
    expect(rememberedText([])).toBe("");
  });
});

describe("only the newest rules go along", () => {
  it("sends at most forty, without their bookkeeping", () => {
    const many: StoredRule[] = Array.from({ length: 50 }, (_, i) => ({
      id: `r${i}`,
      kind: "jewelry",
      field: "title",
      rule: `Rule ${i}`,
      item: "Ring",
      savedAt: 50 - i,
    }));
    const sent = rulesToSend(many);
    expect(sent).toHaveLength(40);
    expect(sent[0]).toEqual({ kind: "jewelry", field: "title", rule: "Rule 0" });
  });
});

describe("the learning step on the server", () => {
  it("makes rules from her changes and answers nothing for nothing", async () => {
    const sent: any[] = [];
    vi.resetModules();
    vi.doMock("@/lib/anthropic", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/anthropic")>()),
      getClient: () => ({
        messages: {
          create: async (params: unknown) => {
            sent.push(params);
            return {
              model: "claude-sonnet-4-6",
              stop_reason: "end_turn",
              usage: { input_tokens: 2_000, output_tokens: 100 },
              content: [
                { type: "text", text: JSON.stringify({ rules: [{ field: "title", rule: "Put the metal before the stone." }] }) },
              ],
            };
          },
        },
      }),
    }));
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/learn/route");
    const req = (b: unknown) =>
      new NextRequest("http://localhost/api/learn", { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } });
    const res = await (
      await route.POST(
        req({
          kind: "jewelry",
          item: "Ring",
          notes: "",
          changes: { title: { before: "Stunning Garnet Ring", after: "Sterling Silver Garnet Ring" } },
          known: [],
        }),
      )
    ).json();
    expect(res.ok).toBe(true);
    expect(res.rules).toEqual([{ kind: "jewelry", field: "title", rule: "Put the metal before the stone." }]);
    expect(res.usage[0].stage).toBe("learning");
    expect(sent[0].system).toContain("Never make a rule from a correction of a FACT");

    const none = await (await route.POST(req({ kind: "jewelry", item: "Ring", notes: "", changes: {}, known: [] }))).json();
    expect(none).toEqual({ ok: true, rules: [], usage: [] });
    expect(sent).toHaveLength(1);
    vi.doUnmock("@/lib/anthropic");
  });
});
