import { describe, expect, it } from "vitest";
import { measurementInQuote, photoFactProblem } from "@/lib/photo-facts";

const fact = (name: string, value: string, quote: string) => ({
  name,
  value,
  photoIndices: [1],
  basis: "label",
  quote,
});
const LENGTH = { name: "Necklace Length", mode: "FREE_TEXT" as const, values: ["34 in", "35 in", "36 in"] };

describe("a measurement on a label is the same however it is written (28 Oct 2026)", () => {
  it("accepts the necklace's 35 in from 'Adjustable 35-40'", () => {
    // Refused before as "not what the label says".
    expect(photoFactProblem(fact("Necklace Length", "35 in", "Adjustable 35-40"), 3, LENGTH)).toBeNull();
  });

  it("accepts the same number in other spellings and units", () => {
    expect(measurementInQuote("2.75 in", 'Pendant measures 2 x 2.75"')).toBe(true);
    expect(measurementInQuote("18 in", "18 inches long")).toBe(true);
    expect(measurementInQuote("40 in", "adjustable 35 to 40 in")).toBe(true);
    expect(measurementInQuote("45 cm", "Length 45 cm")).toBe(true);
  });

  it("refuses a number the label does not have, or has in another unit", () => {
    expect(measurementInQuote("36 in", "Adjustable 35-40")).toBe(false);
    expect(measurementInQuote("35 in", "Length 35 cm")).toBe(false);
    expect(photoFactProblem(fact("Necklace Length", "36 in", "Adjustable 35-40"), 3, LENGTH)).toBe(
      "not what the label says",
    );
  });

  it("never turns a size or a style number into inches", () => {
    expect(measurementInQuote("7 in", "Size 7")).toBe(false);
    expect(measurementInQuote("18 in", "Style 18 Blue")).toBe(false);
  });

  it("leaves word values to the word-for-word check", () => {
    expect(measurementInQuote("Adjustable", "Adjustable 35-40")).toBe(false);
    expect(photoFactProblem(fact("Features", "Adjustable", "Adjustable 35-40"), 3)).toBeNull();
  });
});

describe("the photo pass is told the shortest length for a range", () => {
  it("names the rule", async () => {
    const { readFileSync } = await import("fs");
    expect(readFileSync("lib/ebay/aspectFill.ts", "utf8")).toContain(
      "choose the SHORTEST length of the range that eBay's list offers",
    );
  });
});
