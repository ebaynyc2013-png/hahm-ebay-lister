import { describe, expect, it } from "vitest";
import { applyMakerMarkRules, brandNeedsConfirmation, MAKER_MARKS } from "@/lib/maker-marks";
import { draftIssues } from "@/lib/client-review";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import { AI_LISTING_SCHEMA } from "@/lib/ai-schema";
import type { ItemGroup, ListingResult } from "@/lib/types";

describe("a maker's mark is never 'Unbranded'", () => {
  it("empties the brand and drops the Unbranded line when a mark is visible", () => {
    // The real Premier Designs necklace, as the model first wrote it.
    const l: ListingResult = {
      title: "Gold Brown Twisted Cord Hammered Open Diamond Pendant Necklace Boho",
      description: "Gold Brown Twisted Cord Pendant Necklace\n\nBrand: Unbranded\n\nCondition: Very good.",
      brand: "Unbranded",
      item_specifics: { Brand: "Unbranded", Color: "Gold" },
      maker_marks: ["Photo 2: small crown-shaped tag at the end of the extender chain"],
      brand_source: "none",
    };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("");
    expect(l.item_specifics).toEqual({ Color: "Gold" });
    expect(l.description).toBe("Gold Brown Twisted Cord Pendant Necklace\n\nCondition: Very good.");
    expect(brandNeedsConfirmation(l)).toBe(false);
  });

  it("keeps Unbranded where no mark is seen", () => {
    const l: ListingResult = { title: "x", description: "Brand: Unbranded", brand: "Unbranded", maker_marks: [] };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("Unbranded");
    expect(l.description).toBe("Brand: Unbranded");
  });

  it("holds a brand read from a known mark until the seller confirms it", () => {
    const l: ListingResult = {
      title: "Premier Designs Gold Pendant Necklace",
      description: "",
      brand: "Premier Designs",
      brand_source: "maker_mark",
      maker_marks: ["Photo 2: crown tag on the extender"],
    };
    applyMakerMarkRules(l);
    expect(brandNeedsConfirmation(l)).toBe(true);
    const g: ItemGroup = { id: "g", sku: "SKU-1", name: "n", photoIds: ["p"], status: "done", listing: l };
    expect(draftIssues(g).join(" ")).toContain("Confirm the brand Premier Designs");
    l.brand_confirmed = true;
    expect(draftIssues(g).join(" ")).not.toContain("Confirm the brand");
  });

  it("never asks to confirm a brand read on a label", () => {
    const l: ListingResult = { title: "x", description: "", brand: "Monet", brand_source: "label", maker_marks: ["Photo 3: MONET stamped on the clasp"] };
    applyMakerMarkRules(l);
    expect(brandNeedsConfirmation(l)).toBe(false);
  });
});

describe("the model knows the rule and the marks", () => {
  const prompt = buildProfiledAnalysisPrompt("jewelry");

  it("starts the list with the seller's Premier Designs crown", () => {
    expect(MAKER_MARKS[0].brand).toBe("Premier Designs");
    expect(prompt).toContain("KNOWN MAKER'S MARKS");
    expect(prompt).toContain("Premier Designs: a small crown-shaped tag");
    expect(prompt).toContain('NEVER "Unbranded" when any maker\'s mark is visible');
  });

  it("looks for marks before naming the brand, and says where the brand came from", () => {
    const order = Object.keys(AI_LISTING_SCHEMA.properties);
    expect(order.indexOf("maker_marks")).toBeLessThan(order.indexOf("brand"));
    expect(order.indexOf("brand_source")).toBe(order.indexOf("brand") + 1);
    expect(AI_LISTING_SCHEMA.required).toEqual(
      expect.arrayContaining(["maker_marks", "brand_source"]),
    );
  });
});
