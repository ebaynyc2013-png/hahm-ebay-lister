import { describe, expect, it } from "vitest";
import { isStoneAbsence, photoFactProblem } from "@/lib/photo-facts";

const field = (name: string, values: string[]) => ({
  name,
  mode: "FREE_TEXT" as const,
  values,
});
const STONES = ["Agate", "Amethyst", "Crystal", "No Stone", "Pearl", "Topaz"];
const fact = (name: string, value: string) => ({
  name,
  value,
  photoIndices: [1],
  basis: "visible_feature",
  quote: "",
});

describe("'No Stone' is read from a photo, for every kind of jewellery", () => {
  it("accepts eBay's No Stone for Main and Secondary Stone", () => {
    // The plain gold Premier Designs pendant: both came back refused.
    for (const name of ["Main Stone", "Secondary Stone", "Gemstone", "Accent Stone"])
      expect(photoFactProblem(fact(name, "No Stone"), 2, field(name, STONES)), name).toBeNull();
  });

  it("still never names a stone from its look", () => {
    expect(photoFactProblem(fact("Main Stone", "Topaz"), 2, field("Main Stone", STONES))).toBe(
      "needs a label or your note, not just a look",
    );
  });

  it("takes only eBay's own word, and only on its own", () => {
    expect(isStoneAbsence("No Stone", field("Main Stone", ["Agate", "Pearl"]))).toBe(false);
    expect(isStoneAbsence("No Stone | Pearl", field("Main Stone", STONES))).toBe(false);
    expect(isStoneAbsence("no stone", field("Main Stone", STONES))).toBe(true);
  });

  it("leaves stone details alone — colour, shape, count are other questions", () => {
    for (const name of ["Main Stone Color", "Main Stone Shape", "Number of Stones", "Main Stone Creation"])
      expect(isStoneAbsence("No Stone", field(name, ["No Stone"])), name).toBe(false);
  });
});
