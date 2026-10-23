import { describe, expect, it } from "vitest";
import { applyAspectAliases } from "@/lib/ebay/aspects";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

const free = (name: string): AspectMeta => ({
  name,
  required: true,
  usage: "REQUIRED",
  mode: "FREE_TEXT",
  cardinality: "SINGLE",
  values: [],
});

const SHOE_META: AspectMeta[] = [free("Upper Material"), free("Material")];

describe("applyAspectAliases", () => {
  it("fills Upper Material from the material already established", () => {
    const aspects: Record<string, string[]> = { Material: ["Satin"] };
    applyAspectAliases(aspects, SHOE_META);
    expect(aspects["Upper Material"]).toEqual(["Satin"]);
  });

  it("leaves an ambiguous material alone", () => {
    // Which of the two is the upper? Nothing here says, so nothing is filled.
    const aspects: Record<string, string[]> = {
      Material: ["Leather", "Rubber"],
    };
    applyAspectAliases(aspects, SHOE_META);
    expect(aspects["Upper Material"]).toBeUndefined();
  });

  it("never overwrites what is already there", () => {
    const aspects: Record<string, string[]> = {
      Material: ["Satin"],
      "Upper Material": ["Leather"],
    };
    applyAspectAliases(aspects, SHOE_META);
    expect(aspects["Upper Material"]).toEqual(["Leather"]);
  });

  it("does nothing where eBay asks for no such aspect", () => {
    const aspects: Record<string, string[]> = { Material: ["Satin"] };
    applyAspectAliases(aspects, [free("Material")]);
    expect(aspects).toEqual({ Material: ["Satin"] });
  });

  it("only fills a value the category accepts", () => {
    const picky: AspectMeta[] = [
      {
        name: "Upper Material",
        required: true,
        usage: "REQUIRED",
        mode: "SELECTION_ONLY",
        cardinality: "SINGLE",
        values: ["Leather", "Suede"],
      },
    ];
    const aspects: Record<string, string[]> = { Material: ["Satin"] };
    applyAspectAliases(aspects, picky);
    expect(aspects["Upper Material"]).toBeUndefined();
  });
});

describe("applyAspectAliases — Metal from Material", () => {
  const jewellery: AspectMeta[] = [free("Metal"), free("Material")];

  it("fills the required Metal from the hallmark reading", () => {
    // The real case: Material read as "Sterling Silver 925" off the hallmark,
    // Metal Purity 925 beside it, and Metal — required — left empty.
    const aspects: Record<string, string[]> = {
      Material: ["Sterling Silver 925"],
    };
    applyAspectAliases(aspects, jewellery);
    expect(aspects.Metal).toEqual(["Sterling Silver"]);
  });

  it("drops the purity marking, which eBay files separately", () => {
    for (const [material, metal] of [
      ["Sterling Silver 925", "Sterling Silver"],
      ["925 Sterling Silver", "Sterling Silver"],
      ["14k Yellow Gold", "Yellow Gold"],
      ["18 K White Gold", "White Gold"],
      ["Yellow Gold", "Yellow Gold"],
    ] as const) {
      const aspects: Record<string, string[]> = { Material: [material] };
      applyAspectAliases(aspects, jewellery);
      expect(aspects.Metal).toEqual([metal]);
    }
  });

  it("carries nothing across when only a purity was recorded", () => {
    // "925" alone names no metal.
    const aspects: Record<string, string[]> = { Material: ["925"] };
    applyAspectAliases(aspects, jewellery);
    expect(aspects.Metal).toBeUndefined();
  });

  it("still fills Upper Material, purity marking untouched", () => {
    const shoes: AspectMeta[] = [free("Upper Material"), free("Material")];
    const aspects: Record<string, string[]> = { Material: ["Satin"] };
    applyAspectAliases(aspects, shoes);
    expect(aspects["Upper Material"]).toEqual(["Satin"]);
  });
});
