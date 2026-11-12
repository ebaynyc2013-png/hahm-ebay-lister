import { describe, expect, it } from "vitest";
import { applyMeasuredDimensions, dropImportedCountry, measuredDimensions } from "@/lib/listing-defaults";
import { valueInNotes } from "@/lib/note-facts";
import type { ListingResult } from "@/lib/types";

const inches = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${from + i} in`);
const meta = [
  { name: "Bag Width", values: inches(3, 24) },
  { name: "Bag Height", values: inches(3, 16) },
  { name: "Bag Depth", values: inches(3, 8) },
];
// The Marc Jacobs tote of 12 Nov 2026.
const NOTES = '100 cotton, Marc Jacobs tote bag in patchwork denim\nApprox. 13.4"H x 16.5"W x 6.3"D\nImported';

describe("bag specifics from her notes (12 Nov 2026)", () => {
  it("reads height, width and depth", () => {
    expect(measuredDimensions(NOTES)).toEqual({ H: 13.4, W: 16.5, D: 6.3 });
    expect(measuredDimensions('Measurements: Approximately 13.5"H x 16.5"W x 6.25"D (34.3 H x 41.9 W x 15.9 D cm)')).toEqual({
      H: 13.5,
      W: 16.5,
      D: 6.25,
    });
  });
  it("fills Bag Width, Height, Depth with eBay's nearest value", () => {
    const a: Record<string, string[]> = {};
    applyMeasuredDimensions(a, meta, { seller_notes: NOTES, description: "" } as ListingResult);
    expect(a).toEqual({ "Bag Height": ["13 in"], "Bag Width": ["17 in"], "Bag Depth": ["6 in"] });
  });
  it("never overwrites a field already answered", () => {
    const a: Record<string, string[]> = { "Bag Width": ["16 in"] };
    applyMeasuredDimensions(a, meta, { seller_notes: NOTES } as ListingResult);
    expect(a["Bag Width"]).toEqual(["16 in"]);
  });
  it('"Imported" is never a country', () => {
    const a: Record<string, string[]> = { "Country/Region of Manufacture": ["Imported"], Brand: ["Marc Jacobs"] };
    dropImportedCountry(a);
    expect(a).toEqual({ Brand: ["Marc Jacobs"] });
  });
  it("a value written in her notes counts: Denim, Cotton — not Leather", () => {
    expect(valueInNotes("Denim", NOTES)).toBe(true);
    expect(valueInNotes("Cotton", NOTES)).toBe(true);
    expect(valueInNotes("Leather", NOTES)).toBe(false);
  });
});
