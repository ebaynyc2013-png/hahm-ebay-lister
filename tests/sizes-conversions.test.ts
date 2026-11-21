import { describe, expect, it } from "vitest";
import {
  PANDORA_RINGS,
  applyRingSize,
  euToUs,
  isRing,
  parseRingSize,
  ringSizeInDescription,
  ringSizeInTitle,
  ukToUs,
} from "@/lib/ring-size";
import { chartForDepartment, fillShoeSizes, findShoeSizeRow } from "@/lib/shoe-sizes";
import { shoeSizesInTitle } from "@/lib/title-shoe-size";
import { otherForeignSize, otherSizeForList, otherSizeInDescription, otherSizeInTitle } from "@/lib/size-conversions";
import { foreignSizeInTitle } from "@/lib/foreign-size";
import { pickSizeFromList } from "@/lib/clothing-size";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import type { ListingResult } from "@/lib/types";

// Sizes not made in America — the seller's rules of 16 Nov 2026: the size as
// marked first, then the American one, from a chart, never a guess.

const item = (over: Partial<ListingResult>): ListingResult =>
  ({ title: "T", description: "T\n\nBrand: B", ...over }) as ListingResult;

describe("rings: Pandora's chart for every brand", () => {
  it("holds Pandora's 17 rows (us.pandora.net, 16 Nov 2026)", () => {
    expect(PANDORA_RINGS).toHaveLength(17);
    expect(euToUs(54)).toBe(7);
    expect(euToUs(56)).toBe(7.5);
    expect(euToUs(48)).toBe(4.5);
  });
  it("the circumference agrees with every row to within a quarter size", () => {
    for (const r of PANDORA_RINGS) {
      const byCircle = Math.round(((r.eu / Math.PI - 11.63) / 0.8128) * 4) / 4;
      expect(Math.abs(byCircle - r.us), `EU ${r.eu}`).toBeLessThanOrEqual(0.25);
    }
  });
  it("a size between the rows comes from the circumference", () => {
    expect(euToUs(61)).toBe(9.5);
    expect(euToUs(45)).toBe(3.25);
  });
  it("British letters, Pandora's and in between", () => {
    expect(ukToUs("N")).toBe(7);
    expect(ukToUs("M")).toBe(6.5);
    expect(ukToUs("K")).toBe(5.25);
  });
  it("reads the size as marked; an American size is left alone", () => {
    expect(parseRingSize("54")).toEqual({ system: "EU", value: "54", us: "7" });
    expect(parseRingSize("Size EU 56")).toEqual({ system: "EU", value: "56", us: "7.5" });
    expect(parseRingSize("UK N")).toEqual({ system: "UK", value: "N", us: "7" });
    expect(parseRingSize("7")).toBeNull();
    expect(parseRingSize("7.5")).toBeNull();
  });
  it("only rings to wear", () => {
    expect(isRing({ item_type: "Cocktail Ring" })).toBe(true);
    expect(isRing({ item_type: "Drop Earrings" })).toBe(false);
    expect(isRing({ item_type: "Key Ring" })).toBe(false);
  });
  const ring = item({
    title: "Pandora Sterling Silver Heart Ring Size EU 54",
    item_type: "Ring",
    size: "EU 54",
    description: "Pandora Sterling Silver Heart Ring Size EU 54\n\nBrand: Pandora\n\nSize: EU 54",
  });
  it("title: both sizes, the ring's own first (16 Nov 2026)", () => {
    expect(ringSizeInTitle(ring.title, ring)).toBe("Pandora Sterling Silver Heart Ring Size EU 54 US 7");
    expect(ringSizeInTitle("Pandora Heart Ring Size 54", ring)).toBe("Pandora Heart Ring Size EU 54 US 7");
    // Already complete — left as it is.
    expect(ringSizeInTitle("Pandora Heart Ring Size EU 54 US 7", ring)).toBe("Pandora Heart Ring Size EU 54 US 7");
  });
  it("description: as marked, then American", () => {
    expect(ringSizeInDescription(ring.description, ring)).toContain("Size: EU 54 (US 7)");
  });
  it("Ring Size: the nearest value on eBay's list", () => {
    const a: Record<string, string[]> = {};
    expect(applyRingSize(a, [{ name: "Ring Size", values: ["6", "6.5", "7", "7.5"] }], ring)).toBe(true);
    expect(a["Ring Size"]).toEqual(["7"]);
    const o = item({ item_type: "Ring", size: "EU 55" });
    const b: Record<string, string[]> = {};
    applyRingSize(b, [{ name: "Ring Size", values: ["7", "7 1/4", "7 1/2"] }], o);
    expect(b["Ring Size"]).toEqual(["7 1/4"]);
    const c: Record<string, string[]> = {};
    applyRingSize(c, [{ name: "Ring Size", values: [] }], ring);
    expect(c["Ring Size"]).toEqual(["7"]);
  });
});

describe("kids' and baby shoes: eBay's chart", () => {
  it("rows as eBay gives them; two US sizes where eBay has two", () => {
    expect(findShoeSizeRow("27", "Kids", "eu")?.us).toBe("10");
    expect(findShoeSizeRow("33.5", "Kids", "eu")?.us).toBe("1");
    expect(findShoeSizeRow("17", "Baby", "eu")?.us).toBe("1.5-2");
    expect(findShoeSizeRow("16", "Baby", "eu")?.us).toBe("0.5-1");
  });
  it("eBay's department names read as the right chart", () => {
    expect(chartForDepartment("Boys")).toBe("Kids");
    expect(chartForDepartment("Unisex Kids")).toBe("Kids");
    expect(chartForDepartment("Baby Girls")).toBe("Baby");
    expect(chartForDepartment("Women")).toBe("Women");
    expect(chartForDepartment("")).toBeNull();
  });
  it("description: Size: EU 17 (US 1.5-2)", () => {
    const baby = item({ item_type: "Baby Shoes", size: "EU 17", description: "T\n\nBrand: B\n\nSize: EU 17" });
    expect(otherSizeInDescription(baby.description, baby)).toContain("Size: EU 17 (US 1.5-2)");
  });
  it("eBay's shoe fields filled for a kids' department", () => {
    const aspects: Record<string, string[]> = { Department: ["Boys"], "EU Shoe Size": ["28"] };
    const meta = ["US Shoe Size", "UK Shoe Size", "EU Shoe Size"].map((name) => ({ name, values: [], mode: "FREE_TEXT" })) as never;
    fillShoeSizes(aspects, meta);
    expect(aspects["US Shoe Size"]).toEqual(["10.5"]);
    expect(aspects["UK Shoe Size"]).toEqual(["9.5"]);
  });
  it("a kids' shoe title gets both sizes; a baby shoe title is left as written", () => {
    expect(shoeSizesInTitle("Nike Sneakers EU 28", item({ item_type: "Kids Sneakers" }))).toBe("Nike Sneakers Size 10.5 EU 28");
    expect(shoeSizesInTitle("Robeez Shoes EU 17", item({ item_type: "Baby Shoes" }))).toBe("Robeez Shoes EU 17");
  });
});

describe("men's tailoring and shirts", () => {
  const men = (item_type: string, size: string) =>
    item({ item_type, size, item_specifics: { Department: "Men" }, description: `T\n\nBrand: B\n\nSize: ${size}` });
  it("jacket and suit: EU = US + 10", () => {
    expect(otherForeignSize(men("Blazer", "EU 50"))?.line).toBe("Size: EU 50 (US 40)");
    expect(otherForeignSize(men("Suit", "IT 52"))?.line).toBe("Size: EU 52 (US 42)");
  });
  it("trousers: the waist, EU − 16", () => {
    expect(otherForeignSize(men("Dress Pants", "EU 50"))?.line).toBe("Size: EU 50 (US 34)");
  });
  it("dress shirt: the collar from eBay's chart", () => {
    expect(otherForeignSize(men("Dress Shirt", "39"))?.line).toBe("Size: EU 39 (US 15.5)");
    // 40 is not on eBay's chart: 40 cm = 15.75 in, the nearest half is 15.5.
    expect(otherForeignSize(men("Dress Shirt", "40 cm"))?.line).toBe("Size: EU 40 (US 15.5)");
  });
  it("a bare number on a jacket could be either system — left alone", () => {
    expect(otherForeignSize(men("Blazer", "50"))).toBeNull();
    expect(otherForeignSize(men("Blazer", "40R"))).toBeNull();
  });
  it("women's clothing is not touched here", () => {
    expect(otherForeignSize(item({ item_type: "Blazer", size: "EU 50", item_specifics: { Department: "Women" } }))).toBeNull();
  });
});

describe("children's clothing: the height beside the American size", () => {
  const kid = (size: string) =>
    item({ item_type: "Dress", size, item_specifics: { Department: "Girls" }, description: `T\n\nBrand: B\n\nSize: ${size}` });
  it("EU 104 is US 4T, up to 104 cm", () => {
    expect(otherSizeInDescription(kid("104").description, kid("104"))).toContain(
      'Size: EU 104 (US 4T, fits up to 104 cm / 41")',
    );
  });
  it("a double size is read by the taller", () => {
    expect(otherForeignSize(kid("98/104"))?.line).toBe('Size: EU 98/104 (US 4T, fits up to 104 cm / 41")');
  });
  it("Carter's table across the range", () => {
    const us = (s: string) => otherForeignSize(kid(s))?.us;
    expect([us("92"), us("98"), us("110"), us("116"), us("140"), us("62")]).toEqual(["2T", "3T", "5", "6", "10", "6M"]);
  });
  it("an American size is left alone", () => {
    expect(otherForeignSize(kid("4T"))).toBeNull();
    expect(otherForeignSize(kid("10"))).toBeNull();
  });
  it("eBay's Size gets the American size from its list", () => {
    const aspects: Record<string, string[]> = {};
    pickSizeFromList(aspects, [{ name: "Size", values: ["3T", "4T", "5"] }] as never, "104", otherSizeForList(kid("104")));
    expect(aspects.Size).toEqual(["4T"]);
  });
});

describe("the title says both sizes — we sell in America (16 Nov 2026)", () => {
  it("men's jacket: EU 50 US 40", () => {
    const l = item({ item_type: "Blazer", size: "EU 50", item_specifics: { Department: "Men" } });
    expect(otherSizeInTitle("Hugo Boss Navy Wool Blazer EU 50 Two Button", l)).toBe("Hugo Boss Navy Wool Blazer EU 50 US 40 Two Button");
  });
  it("children's: EU 104 US 4T; baby shoes: EU 17 US 1.5-2", () => {
    const dress = item({ item_type: "Dress", size: "104", item_specifics: { Department: "Girls" } });
    expect(otherSizeInTitle("Zara Kids Floral Dress Size 104", dress)).toBe("Zara Kids Floral Dress EU 104 US 4T");
    const shoe = item({ item_type: "Baby Shoes", size: "EU 17" });
    expect(otherSizeInTitle("Robeez Pink Leather Shoes EU 17", shoe)).toBe("Robeez Pink Leather Shoes EU 17 US 1.5-2");
  });
  it("kids' shoes are left to the shoe rule", () => {
    const shoe = item({ item_type: "Kids Sneakers", size: "EU 28" });
    expect(otherSizeInTitle("Nike Sneakers Size 10.5 EU 28", shoe)).toBe("Nike Sneakers Size 10.5 EU 28");
  });
  it("tight for 80: the aesthetic tail goes first, both sizes stay", () => {
    const l = item({
      item_type: "Blazer",
      size: "EU 50",
      item_specifics: { Department: "Men" },
      aesthetics: ["Old Money"],
    });
    const t = `${"Word ".repeat(12)}Blazer EU 50 Old Money`; // 81 with US 40 and the tail
    const out = otherSizeInTitle(t, l);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith("Blazer EU 50 US 40")).toBe(true);
  });
  it("women's clothing too: the tail goes before EU 38", () => {
    const top = item({ item_type: "Top", size: "EU 38", aesthetics: ["Boho"] });
    const t = `${"Word ".repeat(12)}Top EU 38 Boho`; // too long with M Medium and Boho
    const out = foreignSizeInTitle(t, top);
    expect(out.endsWith("Top EU 38 M Medium")).toBe(true);
  });
});

describe("the writer writes sizes as marked and never converts them", () => {
  const p = buildProfiledAnalysisPrompt("auto");
  it("rings, men's, children's, kids' shoes", () => {
    expect(p).toContain("Never convert a ring size yourself");
    expect(p).toContain('"Size: EU 54" → "Size: EU 54 (US 7)"');
    expect(p).toContain("fits up to 104 cm");
    expect(p).toContain('"Size: EU 17" → "(US 1.5-2)"');
  });
});
