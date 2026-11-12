import { describe, expect, it } from "vitest";
import { applyJewelryFeatures } from "@/lib/listing-defaults";
import type { ListingResult } from "@/lib/types";

const meta = [
  { name: "Features", values: ["Adjustable", "Engraved", "Magnetic", "Nickel-Free", "Reversible", "Stackable"], cardinality: "MULTI" },
  { name: "Metal", values: [], cardinality: "SINGLE" },
];
const JEWELRY = "Jewelry & Watches > Fine Jewelry > Necklaces & Pendants";
const l = (over: Partial<ListingResult> = {}) => ({ title: "T", description: "T", ...over }) as ListingResult;

describe("jewellery Features — the seller's rules of 12 Nov 2026", () => {
  it("sterling silver, gold and stainless steel are Nickel-Free", () => {
    for (const metal of ["Sterling Silver", "Yellow Gold", "Stainless Steel"]) {
      const a: Record<string, string[]> = { Metal: [metal], Features: ["Stackable"] };
      applyJewelryFeatures(a, meta, l(), JEWELRY);
      expect(a.Features).toEqual(["Stackable", "Nickel-Free"]);
    }
  });
  it("costume jewellery only when her notes say nickel free", () => {
    const a: Record<string, string[]> = { Metal: ["Brass"] };
    applyJewelryFeatures(a, meta, l(), JEWELRY);
    expect(a.Features).toBeUndefined();
    const b: Record<string, string[]> = { Metal: ["Yellow Gold Plated"] };
    applyJewelryFeatures(b, meta, l({ seller_notes: "nickel free, hypoallergenic" }), JEWELRY);
    expect(b.Features).toEqual(["Nickel-Free"]);
  });
  it("never with nickel named", () => {
    const a: Record<string, string[]> = { Metal: ["Sterling Silver"], Features: ["Nickel-Free"] };
    applyJewelryFeatures(a, meta, l({ description: "T\n\nMaterial: Nickel silver chain." }), JEWELRY);
    expect(a.Features).toBeUndefined();
  });
  it("Engraved only with letters, never for a pattern", () => {
    const a: Record<string, string[]> = { Metal: ["Bronze"], Features: ["Engraved"] };
    applyJewelryFeatures(a, meta, l({ description: "T\n\nDetails: Etched open flower." }), JEWELRY);
    expect(a.Features).toBeUndefined();
    const b: Record<string, string[]> = { Metal: ["Bronze"], Features: ["Engraved"] };
    applyJewelryFeatures(b, meta, l({ description: "T\n\nDetails: Engraved with the initials A.M." }), JEWELRY);
    expect(b.Features).toEqual(["Engraved"]);
  });
  it("only jewellery", () => {
    const a: Record<string, string[]> = { Metal: ["Sterling Silver"] };
    expect(applyJewelryFeatures(a, meta, l(), "Clothing, Shoes & Accessories > Women > Bags")).toBe(false);
  });
  it("the AI is told the rules", async () => {
    const src = (await import("node:fs")).readFileSync("lib/ebay/aspectFill.ts", "utf8");
    expect(src).toContain("Features in JEWELLERY (the seller's rules, 12 Nov 2026)");
    expect(src).toContain("NOT Stackable: a piece that is the jewellery on its own");
  });
});
