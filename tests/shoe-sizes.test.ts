import { describe, expect, it } from "vitest";
import {
  fillShoeSizes,
  findShoeSizeRow,
  guessSizeSystem,
  shoeSizesFor,
} from "@/lib/shoe-sizes";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

const sel = (name: string, values: string[]): AspectMeta => ({
  name,
  required: false,
  usage: "OPTIONAL",
  mode: "SELECTION_ONLY",
  cardinality: "SINGLE",
  values,
});

// Named as eBay names them on a Women's Sandals listing.
const SHOE_META: AspectMeta[] = [
  sel("US Shoe Size", ["6", "6.5", "7", "7.5"]),
  sel("UK Shoe Size", ["4", "4.5", "5"]),
  sel("AU Shoe Size", ["6", "6.5", "7"]),
  sel("EU Shoe Size", ["36", "37", "37.5", "38"]),
  sel("Department", ["Women", "Men"]),
];

describe("shoe size conversion", () => {
  it("converts the size stamped on a women's insole", () => {
    // eBay's chart: women's EU 37 (37 1/3) = US 6.5, UK 4.5, AU 6.5.
    expect(shoeSizesFor("37", "Women")).toEqual({
      "US Shoe Size": "6.5",
      "UK Shoe Size": "4.5",
      "AU Shoe Size": "6.5",
      "EU Shoe Size": "37",
    });
  });

  it("reads the size however the shoe spells it", () => {
    for (const stamped of ["37", "37 1/3", "EUR 37", "Size 37", "eu 37"])
      expect(shoeSizesFor(stamped, "Women")["US Shoe Size"]).toBe("6.5");
    // A US size resolves back to the same row.
    expect(shoeSizesFor("6.5", "Women", "us")["EU Shoe Size"]).toBe("37");
    expect(shoeSizesFor("6 1/2", "Women", "us")["EU Shoe Size"]).toBe("37");
  });

  it("keeps women's and men's charts apart", () => {
    // Men's EU 42 is US 9.5; women's EU 42 is US 11.5.
    expect(shoeSizesFor("42", "Men")["US Shoe Size"]).toBe("9.5");
    expect(shoeSizesFor("42", "Women")["US Shoe Size"]).toBe("11.5");
  });

  it("fills nothing for a size that is not on eBay's chart", () => {
    expect(shoeSizesFor("99", "Women")).toEqual({});
    expect(shoeSizesFor("", "Women")).toEqual({});
    expect(shoeSizesFor("unknown", "Women")).toEqual({});
    expect(findShoeSizeRow("99", "Women")).toBeNull();
  });

  it("treats a bare number of 25 or more as European", () => {
    // US and UK women's sizes stop well short of 25, and EU starts at 33, so
    // a plain "37" on an insole can only be European.
    expect(guessSizeSystem("37")).toBe("eu");
    expect(guessSizeSystem("42")).toBe("eu");
    // Below that it is genuinely ambiguous between US and UK — say so rather
    // than pick one and be wrong half the time.
    expect(guessSizeSystem("7")).toBeNull();
    expect(guessSizeSystem("6.5")).toBeNull();
    expect(guessSizeSystem("")).toBeNull();
  });

  it("refuses to guess which system an ambiguous number came from", () => {
    // "4.5" is a US size, a UK size and an AU size all at once. Picking one
    // would be wrong about as often as it was right, so nothing is filled
    // until the caller says which column the number was read from.
    expect(findShoeSizeRow("4.5", "Women")).toBeNull();
    expect(shoeSizesFor("7", "Women")).toEqual({});
    // Told the system, it resolves.
    expect(findShoeSizeRow("4.5", "Women", "uk")?.us).toBe("6.5");
    expect(shoeSizesFor("7", "Women", "us")["EU Shoe Size"]).toBe("37.5");
  });
});

describe("fillShoeSizes", () => {
  it("fills every size field from the one stamped on the shoe", () => {
    // The real case: red satin sandals, 37 on the insole, department read off
    // eBay's category path.
    const aspects: Record<string, string[]> = { Department: ["Women"] };
    fillShoeSizes(aspects, SHOE_META, "37");
    expect(aspects).toEqual({
      Department: ["Women"],
      "US Shoe Size": ["6.5"],
      "UK Shoe Size": ["4.5"],
      "AU Shoe Size": ["6.5"],
      "EU Shoe Size": ["37"],
    });
  });

  it("converts from whichever field the photo pass already filled", () => {
    const aspects: Record<string, string[]> = {
      Department: ["Women"],
      "EU Shoe Size": ["37"],
    };
    fillShoeSizes(aspects, SHOE_META);
    expect(aspects["US Shoe Size"]).toEqual(["6.5"]);
    expect(aspects["UK Shoe Size"]).toEqual(["4.5"]);
  });

  it("never overwrites a size already on the listing", () => {
    const aspects: Record<string, string[]> = {
      Department: ["Women"],
      "US Shoe Size": ["7"],
    };
    fillShoeSizes(aspects, SHOE_META, "37");
    expect(aspects["US Shoe Size"]).toEqual(["7"]);
    // and the rest follow the size that was actually there
    expect(aspects["EU Shoe Size"]).toEqual(["37.5"]);
  });

  it("does nothing until the department is settled", () => {
    const aspects: Record<string, string[]> = {};
    fillShoeSizes(aspects, SHOE_META, "37");
    expect(aspects).toEqual({});
  });

  it("leaves categories that have no shoe sizes alone", () => {
    const earrings: AspectMeta[] = [sel("Department", ["Women"])];
    const aspects: Record<string, string[]> = {
      Department: ["Women"],
      Size: ["37"],
    };
    fillShoeSizes(aspects, earrings, "37");
    expect(aspects).toEqual({ Department: ["Women"], Size: ["37"] });
  });

  it("drops the generic Size, which shoe categories do not have", () => {
    const aspects: Record<string, string[]> = {
      Department: ["Women"],
      Size: ["37"],
    };
    fillShoeSizes(aspects, SHOE_META, "37");
    expect(aspects.Size).toBeUndefined();
    expect(aspects["EU Shoe Size"]).toEqual(["37"]);
  });

  it("fills only sizes eBay accepts for the category", () => {
    // This category offers no UK column at all, and its EU list omits 37.
    const partial: AspectMeta[] = [
      sel("US Shoe Size", ["6.5"]),
      sel("EU Shoe Size", ["38", "39"]),
    ];
    const aspects: Record<string, string[]> = { Department: ["Women"] };
    fillShoeSizes(aspects, partial, "37");
    expect(aspects["US Shoe Size"]).toEqual(["6.5"]);
    expect(aspects["EU Shoe Size"]).toBeUndefined();
    expect(aspects["UK Shoe Size"]).toBeUndefined();
  });
});
