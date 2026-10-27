import { describe, expect, it } from "vitest";
import { findContactInfo, scrubContactInfo, stripContactInfo } from "@/lib/contact-info";
import type { ListingResult } from "@/lib/types";

describe("contact details never reach a listing", () => {
  it("finds websites, emails, phones and handles", () => {
    expect(findContactInfo("Label: WWW.COLIEBLOOM.COM")).toEqual(["WWW.COLIEBLOOM.COM"]);
    expect(findContactInfo("see https://shop.example.org/x?y=1 now")).toEqual([
      "https://shop.example.org/x?y=1",
    ]);
    expect(findContactInfo("visit coliebloom.com today")).toEqual(["coliebloom.com"]);
    expect(findContactInfo("email art@colie.com")).toEqual(["art@colie.com"]);
    expect(findContactInfo("call (555) 123-4567 or 555.123.4567")).toEqual([
      "(555) 123-4567",
      "555.123.4567",
    ]);
    expect(findContactInfo("follow @coliebloom on IG")).toEqual(["@coliebloom"]);
  });

  it("leaves ordinary listing words alone", () => {
    for (const ok of [
      "Tiffany & Co. Sterling Silver 925 Ring Size 8",
      "J.Crew Blue Shirt",
      "Dr. Martens Boots 7M 37.5",
      "Made in U.S.A. 2018",
      "12 x 12 in, 18K gold, 1.5 ct",
      "Measures 10.5 x 7 in",
    ])
      expect(findContactInfo(ok), ok).toEqual([]);
  });

  it("takes the detail out and tidies what is left", () => {
    expect(
      stripContactInfo(
        "Original label reads Colie Bloom Modern Art Boutique, Hand Made, One of a Kind, WWW.COLIEBLOOM.COM.",
      ),
    ).toBe("Original label reads Colie Bloom Modern Art Boutique, Hand Made, One of a Kind.");
    expect(stripContactInfo("Brand: Colie Bloom (coliebloom.com)")).toBe("Brand: Colie Bloom");
  });

  it("cleans every field a listing publishes and says what it removed", () => {
    const l: ListingResult = {
      title: "Colie Bloom Resin Geode Painting www.coliebloom.com",
      description:
        "Colie Bloom Resin Geode Painting\n\nHallmarks: label reads Colie Bloom, WWW.COLIEBLOOM.COM\n\nMounting: ready to hang.",
      condition_notes: "Label attached, call 555-123-4567",
      key_features: ["Signed 2018", "coliebloom.com"],
      item_specifics: { Artist: "Colie Bloom", Website: "www.coliebloom.com" },
    };
    const removed = scrubContactInfo(l);
    expect(removed).toEqual(["www.coliebloom.com", "WWW.COLIEBLOOM.COM", "555-123-4567", "coliebloom.com"]);
    expect(l.title).toBe("Colie Bloom Resin Geode Painting");
    expect(l.description).toBe(
      "Colie Bloom Resin Geode Painting\n\nHallmarks: label reads Colie Bloom\n\nMounting: ready to hang.",
    );
    expect(l.condition_notes).toBe("Label attached");
    expect(l.key_features).toEqual(["Signed 2018"]);
    expect(l.item_specifics).toEqual({ Artist: "Colie Bloom" });
  });

  it("changes nothing in a clean listing", () => {
    const l: ListingResult = { title: "Michael Kors Pumps 7M 37.5", description: "Size: 7M" };
    expect(scrubContactInfo(l)).toEqual([]);
    expect(l.title).toBe("Michael Kors Pumps 7M 37.5");
  });
});

describe("the model is told the rule", () => {
  it("asks for contact details to be reported, never written", async () => {
    const { buildProfiledAnalysisPrompt } = await import("@/lib/prompts");
    const { AI_LISTING_SCHEMA } = await import("@/lib/ai-schema");
    const prompt = buildProfiledAnalysisPrompt("auto");
    expect(prompt).toContain("CONTACT DETAILS SEEN IN THE PHOTOS");
    expect(prompt).toContain("NEVER write it anywhere in the listing");
    expect(prompt).toContain('ONLY in "contact_seen"');
    const order = Object.keys(AI_LISTING_SCHEMA.properties);
    expect(order).toContain("contact_seen");
    expect(order.indexOf("contact_seen")).toBeLessThan(order.indexOf("title"));
    expect(AI_LISTING_SCHEMA.required).toContain("contact_seen");
  });
});
