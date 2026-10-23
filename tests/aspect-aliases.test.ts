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
