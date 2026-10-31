import { describe, expect, it } from "vitest";
import {
  applyVintageAspects,
  confirmVintage,
  isVintage,
  normalizeEra,
  unconfirmVintage,
  vintageFromAnalysis,
  vintageTitle,
} from "@/lib/vintage";
import { photoFactProblem } from "@/lib/photo-facts";
import type { ListingResult } from "@/lib/types";

// eBay's lists for women's tops (53159) and dresses (63861), read 31 Oct 2026.
const tops = [
  { name: "Vintage", values: ["Yes", "No"], cardinality: "SINGLE" },
  { name: "Theme", values: ["20s", "30s", "40s", "50s", "60s", "70s", "80s", "90s", "Floral", "Retro"], cardinality: "MULTI" },
  { name: "Style", values: ["Basic", "Boho", "Casual", "Retro", "Vintage", "Y2k"], cardinality: "SINGLE" },
];
const dresses = [
  { name: "Vintage", values: ["Yes", "No"], cardinality: "SINGLE" },
  { name: "Style", values: ["40s", "50s", "60s", "70s", "Boho", "Retro", "Vintage"], cardinality: "MULTI" },
];
const necklace = [
  { name: "Vintage", values: ["Yes", "No"], cardinality: "SINGLE" },
  { name: "Era", values: ["Victorian (1837-1901)", "Art Deco (1915-1935)", "Retro (1935-1950)", "Undated"], cardinality: "SINGLE" },
];

describe("the era, however it is written", () => {
  it("reads decades, Y2K and named eras", () => {
    expect(normalizeEra("90s")).toBe("90s");
    expect(normalizeEra("1990's")).toBe("90s");
    expect(normalizeEra("nineties")).toBe("90s");
    expect(normalizeEra("70's")).toBe("70s");
    expect(normalizeEra("1975")).toBe("70s");
    expect(normalizeEra("y2k")).toBe("Y2K");
    expect(normalizeEra("early 2000s")).toBe("Y2K");
    expect(normalizeEra("art deco")).toBe("Art Deco");
    expect(normalizeEra("")).toBe("");
    expect(normalizeEra("old")).toBe("");
  });
});

describe("the title opens with Vintage and the era", () => {
  it("puts it first and keeps the rest", () => {
    expect(vintageTitle("GreenHouse Blue Floral Top", "90s")).toBe("Vintage 90s GreenHouse Blue Floral Top");
    expect(vintageTitle("Vintage GreenHouse Top", "80s")).toBe("Vintage 80s GreenHouse Top");
    expect(vintageTitle("Coach Bag", "")).toBe("Vintage Coach Bag");
  });
  it("takes words off the end to fit 80, never the size or the brand", () => {
    const t = "GreenHouse Gray Floral Viscose V-Neck Top T-Shirt Tee M Medium Short Sleeve Boho";
    const out = vintageTitle(t, "90s", { size: "M", brand: "GreenHouse" });
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.startsWith("Vintage 90s GreenHouse")).toBe(true);
    expect(out).toBe("Vintage 90s GreenHouse Gray Floral Viscose V-Neck Top T-Shirt Tee M Medium");
  });
});

describe("eBay's fields for a vintage piece", () => {
  it("tops: Vintage Yes, Theme decade and Retro, Style Vintage", () => {
    const a: Record<string, string[]> = { Theme: ["Floral"], Style: ["Boho"] };
    applyVintageAspects(a, tops, "90s");
    expect(a.Vintage).toEqual(["Yes"]);
    expect(a.Theme).toEqual(["90s", "Retro", "Floral"]);
    expect(a.Style).toEqual(["Vintage"]);
  });
  it("Y2K: Style Y2k", () => {
    const a: Record<string, string[]> = {};
    applyVintageAspects(a, tops, "Y2K");
    expect(a.Style).toEqual(["Y2k"]);
    expect(a.Theme).toEqual(["Retro"]);
  });
  it("dresses: Style gets Vintage and the decade together", () => {
    const a: Record<string, string[]> = { Style: ["Boho"] };
    applyVintageAspects(a, dresses, "70s");
    expect(a.Style).toEqual(["Vintage", "70s", "Boho"]);
  });
  it("jewellery: a named era goes to Era; a decade leaves Era empty", () => {
    const deco: Record<string, string[]> = {};
    applyVintageAspects(deco, necklace, "Art Deco");
    expect(deco.Era).toEqual(["Art Deco (1915-1935)"]);
    const eighties: Record<string, string[]> = {};
    applyVintageAspects(eighties, necklace, "80s");
    expect(eighties.Vintage).toEqual(["Yes"]);
    expect(eighties.Era).toBeUndefined();
  });
});

describe("the analysis answer", () => {
  it("note and clues are kept, none is nothing", () => {
    expect(vintageFromAnalysis({ source: "note", era: "90's", reasons: "" })).toEqual({ source: "note", era: "90s" });
    expect(vintageFromAnalysis({ source: "clues", era: "80s", reasons: "Photo 3: ILGWU label" })).toEqual({
      source: "clues",
      era: "80s",
      reasons: "Photo 3: ILGWU label",
      confirmed: false,
    });
    expect(vintageFromAnalysis({ source: "clues", era: "80s", reasons: "" })).toBeUndefined();
    expect(vintageFromAnalysis({ source: "none", era: "", reasons: "" })).toBeUndefined();
  });
  it("counts as vintage for eBay only from her note or her tick", () => {
    expect(isVintage({ vintage: { source: "note", era: "90s" } })).toBe(true);
    expect(isVintage({ vintage: { source: "clues", era: "90s", confirmed: false } })).toBe(false);
    expect(isVintage({ vintage: { source: "clues", era: "90s", confirmed: true } })).toBe(true);
    expect(isVintage({})).toBe(false);
  });
});

describe("the Possible vintage box", () => {
  const base: ListingResult = {
    title: "GreenHouse Blue Floral Top",
    description: "GreenHouse Blue Floral Top\n\nBrand: GreenHouse",
    item_specifics: { Theme: "Floral", Style: "Boho", Brand: "GreenHouse" },
    vintage: { source: "clues", era: "90s", reasons: "Photo 3: ILGWU label", confirmed: false },
  };
  it("ticked: title, first line of the description and the fields change together", () => {
    const patch = confirmVintage(base, tops);
    expect(patch.title).toBe("Vintage 90s GreenHouse Blue Floral Top");
    expect(patch.description?.split("\n")[0]).toBe("Vintage 90s GreenHouse Blue Floral Top");
    expect(patch.item_specifics).toMatchObject({ Vintage: "Yes", Theme: "90s | Retro | Floral", Style: "Vintage", Brand: "GreenHouse" });
    expect(patch.vintage?.confirmed).toBe(true);
  });
  it("unticked: everything back as it was", () => {
    const ticked = { ...base, ...confirmVintage(base, tops) };
    const back = { ...ticked, ...unconfirmVintage(ticked) };
    expect(back.title).toBe(base.title);
    expect(back.description).toBe(base.description);
    expect(back.item_specifics).toEqual(base.item_specifics);
    expect(back.vintage?.confirmed).toBe(false);
  });
  it("unticked after more was filled in: only the vintage words come out", () => {
    const ticked = { ...base, ...confirmVintage(base, tops) };
    const later: ListingResult = {
      ...ticked,
      title: `${ticked.title} Boho`,
      item_specifics: { ...ticked.item_specifics, Theme: "90s | Retro | Floral | Paisley" },
    };
    const back = { ...later, ...unconfirmVintage(later) };
    expect(back.title).toBe("GreenHouse Blue Floral Top Boho");
    expect(back.item_specifics?.Theme).toBe("Floral | Paisley");
    expect(back.item_specifics?.Style).toBe("Boho");
    expect(back.item_specifics?.Vintage).toBeUndefined();
  });
  it("before Prepare: Vintage Yes now, the rest when eBay's lists are known", () => {
    const patch = confirmVintage(base, []);
    expect(patch.item_specifics?.Vintage).toBe("Yes");
    expect(patch.item_specifics?.Theme).toBe("Floral");
  });
});

describe("Vintage Yes from the seller's note", () => {
  const vintage = { name: "Vintage", mode: "SELECTION_ONLY" as const, values: ["Yes", "No"] };
  const fact = (quote: string) => ({ name: "Vintage", value: "Yes", basis: "label", quote, photoIndices: [1] });
  it("'vintage 90s' on her note passes", () => {
    expect(photoFactProblem(fact("vintage 90s"), 3, vintage)).toBeNull();
    expect(photoFactProblem(fact("Vintage Y2K, $25"), 3, vintage)).toBeNull();
  });
  it("a look or a 'not' does not", () => {
    expect(photoFactProblem(fact("vintage-style print"), 3, vintage)).not.toBeNull();
    expect(photoFactProblem(fact("vintage inspired"), 3, vintage)).not.toBeNull();
    expect(photoFactProblem(fact("not vintage"), 3, vintage)).not.toBeNull();
    expect(
      photoFactProblem({ name: "Vintage", value: "Yes", basis: "visible_feature", quote: "", photoIndices: [1] }, 3, vintage),
    ).not.toBeNull();
  });
});
