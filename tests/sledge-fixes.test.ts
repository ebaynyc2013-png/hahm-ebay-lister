import { describe, expect, it } from "vitest";
import { fitTitle } from "@/lib/title-fit";
import { applyRevision } from "@/lib/revise";
import { AI_LISTING_SCHEMA } from "@/lib/ai-schema";
import { countryInQuote, photoFactProblem } from "@/lib/photo-facts";
import type { ListingResult } from "@/lib/types";

// The Sledge USA tee of 13 Nov 2026.
describe("a long title loses whole words, never half a word", () => {
  it("drops words from the end until it fits", () => {
    expect(fitTitle("Sledge USA Navy Blue Rhinestone Crown V-Neck Long Sleeve T-Shirt Tee M Medium Rocker")).toBe(
      "Sledge USA Navy Blue Rhinestone Crown V-Neck Long Sleeve T-Shirt Tee M Medium",
    );
    expect(fitTitle("Short Title")).toBe("Short Title");
  });
  it("the writer's answer form no longer cuts the title at 80", () => {
    const props = (AI_LISTING_SCHEMA as { properties: Record<string, Record<string, unknown>> }).properties;
    expect(props.title.maxLength).toBeUndefined();
  });
  it("Update with notes keeps whole words too", () => {
    const l = { title: "Old", description: "Old\n\nBody", item_specifics: {} } as unknown as ListingResult;
    const { patch } = applyRevision(l, {
      title: "Sledge USA Navy Blue Rhinestone Crown V-Neck Long Sleeve T-Shirt Tee M Medium Rocker",
    });
    expect(patch.title).toBe("Sledge USA Navy Blue Rhinestone Crown V-Neck Long Sleeve T-Shirt Tee M Medium");
  });
});

describe("MADE IN USA is United States", () => {
  const fact = (value: string, quote: string) => ({
    name: "Country of Origin",
    value,
    basis: "label",
    quote,
    photoIndices: [8],
  });
  it("accepts the short names labels use", () => {
    expect(photoFactProblem(fact("United States", "MADE IN USA"), 8)).toBeNull();
    expect(photoFactProblem(fact("United States", "Made in U.S.A."), 8)).toBeNull();
    expect(photoFactProblem(fact("United Kingdom", "Made in England"), 8)).toBeNull();
  });
  it("still refuses a country the label does not name", () => {
    expect(photoFactProblem(fact("United States", "MADE IN CHINA"), 8)).toBe("not what the label says");
    expect(countryInQuote("Brand", "United States", "MADE IN USA")).toBe(false);
    expect(countryInQuote("Country of Origin", "United States", "USAGE: cold wash")).toBe(false);
  });
});

describe("Update with notes: a field with eBay's list takes a word from it (13 Nov 2026)", () => {
  const COLORS = ["Beige", "Black", "Blue", "Brown", "Gray", "Multicolor", "White"];
  const aspects = [
    { name: "Color", mode: "FREE_TEXT", values: COLORS },
    { name: "Style", mode: "FREE_TEXT", values: ["Biker", "Casual", "Gothic"] },
    { name: "Brand", mode: "FREE_TEXT", values: ["Nike"] },
  ] as never;
  const before = { title: "T", description: "T", item_specifics: { Color: "Black", Brand: "Sledge USA" } } as unknown as ListingResult;
  it("Navy Blue in her notes: Color becomes Blue, the message says why", async () => {
    const { snapRevisionToLists } = await import("@/lib/revise");
    const r = snapRevisionToLists(
      before,
      { patch: { item_specifics: { Color: "Navy Blue", Brand: "Sledge USA" } }, changed: ["Color: Black → Navy Blue"] },
      aspects,
    );
    expect(r.patch.item_specifics?.Color).toBe("Blue");
    expect(r.changed).toEqual(["Color: Black → Blue (eBay's word for Navy Blue)"]);
  });
  it("a word not on the list is not applied", async () => {
    const { snapRevisionToLists } = await import("@/lib/revise");
    const r = snapRevisionToLists(
      before,
      { patch: { item_specifics: { Color: "Black", Brand: "Sledge USA", Style: "Rocker" } }, changed: ["Style: Rocker"] },
      aspects,
    );
    expect(r.patch.item_specifics).toBeUndefined();
    expect(r.changed).toEqual([`Style: "Rocker" is not on eBay's list — left empty`]);
  });
  it("a brand is never held to a list; no draft fields, nothing changes", async () => {
    const { snapRevisionToLists } = await import("@/lib/revise");
    const r = snapRevisionToLists(
      before,
      { patch: { item_specifics: { Color: "Black", Brand: "Sledge" } }, changed: ["Brand: Sledge USA → Sledge"] },
      aspects,
    );
    expect(r.patch.item_specifics?.Brand).toBe("Sledge");
    const r2 = snapRevisionToLists(before, { patch: { item_specifics: { Color: "Navy Blue" } }, changed: [] }, undefined);
    expect(r2.patch.item_specifics?.Color).toBe("Navy Blue");
  });
});
