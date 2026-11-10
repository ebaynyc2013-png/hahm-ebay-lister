import { describe, expect, it } from "vitest";
import { isNotAMakerMark, makerSigns } from "@/lib/brand-signs";
import { applyMakerMarkRules } from "@/lib/maker-marks";
import { applyBrandMpnFallback } from "@/lib/ebay/publish";
import { applySignedFromMarks } from "@/lib/listing-defaults";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import type { ListingResult } from "@/lib/types";

const STERLING = 'Photo 2: stamped "STERLING" on the top arm of the cross, near the bail';

describe("a metal stamp, size or origin is not a maker's mark (10 Nov 2026)", () => {
  it.each([
    STERLING,
    'Photo 3: "925" stamped inside the band',
    'Photo 1: ".925 ITALY" on the clasp tag',
    'Photo 4: "14K" on the clasp',
    'Photo 2: "585" and "14K" stamped on the bail',
    'Photo 5: "1/20 12K GF" on the back',
    'Photo 2: "Stainless Steel" engraved on the back',
    'Photo 6: "Made in China" printed label',
    'Photo 3: "100% Cotton" care label',
    'Photo 2: "Size 8" stamped in the insole',
    // Written without quotes, as the model did on the real cross (10 Nov 2026).
    "Photo 3: STERLING stamped lengthwise on the back of the upper arm of the cross",
    "Photo 2: 925 stamped inside the band",
    "Photo 4: 14K and 585 on the clasp",
    "Photos 2 & 3: .925 ITALY on the clasp tag",
  ])("%s", (mark) => {
    expect(isNotAMakerMark(mark)).toBe(true);
  });

  it.each([
    "Photo 2: small gold crown-shaped tag at the end of the extender chain",
    'Photo 2: "NAPIER" and "STERLING" stamped on the clasp',
    'Photo 3: "TM-12" and "925 MEXICO" on the back',
    'Photo 1: signature "Trifari" on the back',
    'Photo 2: stamped "M" on the clasp',
    'Photo 4: logo plate reading "Coach"',
    "Photo 2: NAPIER and STERLING stamped on the clasp",
    "Photo 3: TM-12 and 925 MEXICO on the back",
    "Photo 2: small heart logo stamped next to 925",
    "Photo 1: Trifari signature on the back",
    "Photo 2: stamped M on the clasp",
    "Photo 3: a tiny engraved mark on the back",
  ])("keeps %s as a maker's sign", (mark) => {
    expect(isNotAMakerMark(mark)).toBe(false);
  });

  it("filters the stamps out and keeps the real signs", () => {
    expect(makerSigns([STERLING, 'Photo 1: signature "Trifari"', "  "])).toEqual([
      'Photo 1: signature "Trifari"',
    ]);
  });
});

describe("Unbranded when nothing names a maker", () => {
  it("the sterling cross: STERLING only → Unbranded, in Brand too", () => {
    const l: ListingResult = {
      title: "Sterling Silver Cross Pendant Necklace Serpentine Chain 925",
      description: "Sterling Silver Cross Pendant Necklace",
      brand: "",
      brand_source: "none",
      maker_marks: [STERLING],
      item_specifics: { Metal: "Sterling Silver" },
    };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("Unbranded");
    expect(l.item_specifics?.Brand).toBe("Unbranded");
    // The stamp stays listed: it still makes eBay's Signed "Yes".
    expect(l.maker_marks).toEqual([STERLING]);
  });

  it("the real card: STERLING written without quotes → Unbranded", () => {
    const l: ListingResult = {
      title: "Sterling Silver Cross Pendant Necklace Serpentine Chain Polished 925 Classic",
      description: "",
      brand: "",
      brand_source: "none",
      maker_marks: ["Photo 3: STERLING stamped lengthwise on the back of the upper arm of the cross"],
      brand_candidates: [],
    };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("Unbranded");
  });

  it("a garment with no label at all → Unbranded", () => {
    const l: ListingResult = { title: "Blue Denim Jacket", description: "", brand: "", brand_source: "none" };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("Unbranded");
  });

  it("an unknown maker's sign keeps the brand empty", () => {
    const l: ListingResult = {
      title: "Gold Tone Pendant Necklace",
      description: "",
      brand: "",
      brand_source: "none",
      maker_marks: ["Photo 3: small gold crown-shaped tag at the end of the extender chain"],
    };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("");
    expect(l.item_specifics?.Brand).toBeUndefined();
  });

  it("possible makers keep the brand empty for the seller to choose", () => {
    const l: ListingResult = {
      title: "Gold Tone Pendant Necklace",
      description: "",
      brand: "",
      brand_source: "none",
      brand_candidates: [{ brand: "Premier Designs", why: "crown tag" }],
    };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("");
  });

  it("a brand read from the label is never replaced", () => {
    const l: ListingResult = { title: "Coach Bag", description: "", brand: "Coach", brand_source: "label", maker_marks: [STERLING] };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("Coach");
  });

  it("a brand already in the item specifics is kept", () => {
    const l: ListingResult = { title: "Top", description: "", brand: "", brand_source: "none", item_specifics: { Brand: "Zara" } };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("");
    expect(l.item_specifics?.Brand).toBe("Zara");
  });

  it("Signed stays Yes for a piece stamped only STERLING", () => {
    const aspects: Record<string, string[]> = {};
    applySignedFromMarks(aspects, [{ name: "Signed", values: ["Yes", "No"] }], {
      maker_marks: [STERLING],
      brand_source: "none",
    });
    expect(aspects.Signed).toEqual(["Yes"]);
  });

  it("the rules tell the model, for every category", () => {
    const p = buildProfiledAnalysisPrompt("clothing");
    expect(p).toContain("NOT A MAKER'S MARK");
    expect(p).toContain('A sterling cross stamped only "STERLING" is "Unbranded"');
  });
});

describe("eBay's Brand/MPN fallback", () => {
  const item = () => ({ product: { aspects: {} as Record<string, string[]>, brand: "X", mpn: "Y" } });

  it("stamps Unbranded only when no maker's sign is on the piece", () => {
    const aspects: Record<string, string[]> = {};
    applyBrandMpnFallback(item(), aspects, { title: "t", description: "", brand: "", maker_marks: [STERLING] }, "SKU1");
    expect(aspects.Brand).toEqual(["Unbranded"]);
  });

  it("leaves Brand empty when a maker's sign is there but no brand was chosen", () => {
    const aspects: Record<string, string[]> = {};
    applyBrandMpnFallback(
      item(),
      aspects,
      { title: "t", description: "", brand: "", maker_marks: ["Photo 3: crown-shaped tag"] },
      "SKU2",
    );
    expect(aspects.Brand).toBeUndefined();
    expect(aspects.MPN).toEqual(["Does Not Apply"]);
  });

  it("keeps the chosen brand", () => {
    const aspects: Record<string, string[]> = {};
    applyBrandMpnFallback(item(), aspects, { title: "t", description: "", brand: "Premier Designs" }, "SKU3");
    expect(aspects.Brand).toEqual(["Premier Designs"]);
  });
});
