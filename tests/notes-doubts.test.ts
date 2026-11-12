import { describe, expect, it } from "vitest";
import { allDoubts, cleanDoubts, listingMismatches } from "@/lib/listing-mismatch";
import { notesSupport, sellerTextSupports } from "@/lib/note-facts";
import { applyRevision } from "@/lib/revise";
import { sellerNotesBlocks } from "@/lib/seller-notes";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import { AI_LISTING_SCHEMA } from "@/lib/ai-schema";
import type { ListingResult } from "@/lib/types";

// The Adajio earrings of 12 Nov 2026, as the working version wrote them.
const adajio = (): ListingResult =>
  ({
    title: "Adajio Copper Bronze Etched Flower Disc Dangle Earrings Handmade USA Boho",
    description:
      "Adajio Copper Bronze Etched Flower Disc Dangle Earrings Handmade USA Boho\n\nThe best statement earrings frame your face.\n\nColor: Copper-tone flower over an antiqued bronze disc.\n\nMaterial: Etched brass disc with a layered copper-tone flower overlay.",
    condition: "EXCELLENT",
    condition_notes: "Excellent pre-owned condition: • Rich and clean",
    item_specifics: { Metal: "Brass", "Base Metal": "Brass", Color: "Gold", Size: "One Size" },
  }) as ListingResult;

describe("the program finds where the title, description and specifics disagree (12 Nov 2026)", () => {
  it("Adajio: the title says Copper and Bronze, Metal says Brass", () => {
    const [d] = listingMismatches(adajio());
    expect(d.field).toBe("Metal");
    expect(d.options).toEqual(expect.arrayContaining(["Brass", "Bronze", "Copper"]));
    expect(d.why).toContain("title says");
  });
  it("copper-tone is a colour, not copper", () => {
    const l = adajio();
    l.title = "Adajio Brass Etched Flower Disc Dangle Earrings";
    l.description = `${l.title}\n\nColor: Copper-tone flower.\n\nMaterial: Etched brass disc.`;
    expect(listingMismatches(l)).toEqual([]);
  });
  it("a settled field is not asked again", () => {
    const l = { ...adajio(), doubts_resolved: ["Metal"] };
    expect(allDoubts(l)).toEqual([]);
  });
  it("leather and faux leather in one listing", () => {
    const l = { title: "Coach Black Leather Bag", description: "Coach Black Leather Bag\n\nMaterial: Faux leather." } as ListingResult;
    expect(listingMismatches(l).map((d) => d.field)).toEqual(["Material"]);
  });
  it("a size letter in the title against the Size field", () => {
    const l = { title: "Reebok Tank Top M Medium Black", description: "x", item_specifics: { Size: "L" } } as ListingResult;
    expect(listingMismatches(l)[0]).toMatchObject({ field: "Size", options: ["L", "M"] });
  });
  it("the writer's doubts: two to four choices, never the brand", () => {
    expect(
      cleanDoubts([
        { field: "Brand", options: ["A", "B"], why: "x" },
        { field: "Metal", options: ["Bronze", "Bronze", "Copper"], why: "y" },
        { field: "Color", options: ["Red"], why: "z" },
      ]),
    ).toEqual([{ field: "Metal", options: ["Bronze", "Copper"], why: "y" }]);
  });
});

describe("her typed notes count like her photographed note (12 Nov 2026)", () => {
  it("a fact quoted from her notes is accepted without a photo", () => {
    const notes = "copper flower, bronze disc; zipper works";
    expect(notesSupport({ value: "Bronze", quote: "bronze disc" }, notes)).toBe(true);
    expect(notesSupport({ value: "Brass", quote: "bronze disc" }, notes)).toBe(false);
    expect(notesSupport({ value: "Bronze", quote: "solid bronze" }, notes)).toBe(false);
    expect(notesSupport({ value: "1.5 in", quote: "length 1.5 in" }, "length 1.5 in")).toBe(true);
  });
  it("the notes go to the writer after the photos", () => {
    expect(sellerNotesBlocks("")).toEqual([]);
    expect(sellerNotesBlocks("copper flower")[0].text).toContain("THE SELLER'S NOTES FOR THIS ITEM");
  });
  it("the writer is told the rules: notes, measurements, doubts", () => {
    const p = buildProfiledAnalysisPrompt("auto");
    expect(p).toContain("THE SELLER'S TYPED NOTES");
    expect(p).toContain('"Length: Approximately 1.5" (3.8 cm)"');
    expect(p).toContain('Measurements: Approximately 13.5"H x 16.5"W x 6.25"D (34.3 H x 41.9 W x 15.9 D cm)');
    expect(p).toContain('Measurements: Approximately 2.75" x 2" (7 x 5.1 cm)');
    expect(p).toContain("no \"Approximately\"");
    expect(p).toContain("DOUBTS");
    expect(AI_LISTING_SCHEMA.required).toContain("doubts");
  });
});

describe("a measurement line answers eBay's length fields", () => {
  const aspect = { name: "Item Length", values: [], mode: "FREE_TEXT" } as never;
  it("Length: Approximately 1.5 in (3.8 cm) → Item Length 1.5 in", () => {
    expect(
      sellerTextSupports("1.5 in", aspect, { description: "T\n\nLength: Approximately 1.5 in (3.8 cm)" }),
    ).toBe(true);
    expect(sellerTextSupports("2 in", aspect, { description: "T\n\nLength: Approximately 1.5 in (3.8 cm)" })).toBe(false);
  });
});

describe("Update with notes: only what her facts touch changes", () => {
  it("keeps the title as the first line and reports what changed", () => {
    const l = adajio();
    const { patch, changed } = applyRevision(l, {
      title: l.title,
      description: `whatever\n\nThe best statement earrings frame your face.\n\nMaterial: Etched bronze disc with a layered copper flower.`,
      condition_notes: l.condition_notes,
      changed_specifics: [
        { name: "metal", value: "Bronze" },
        { name: "Base Metal", value: "Bronze" },
      ],
      removed_specifics: [],
    });
    expect(patch.title).toBeUndefined();
    expect(patch.description?.split("\n")[0]).toBe(l.title);
    expect(patch.description).toContain("Etched bronze disc");
    expect(patch.item_specifics).toMatchObject({ Metal: "Bronze", "Base Metal": "Bronze", Color: "Gold" });
    expect(changed).toEqual(["Description", "Metal: Brass → Bronze", "Base Metal: Brass → Bronze"]);
  });
  it("never removes the brand", () => {
    const l = { ...adajio(), item_specifics: { Brand: "Adajio" } } as ListingResult;
    expect(applyRevision(l, { removed_specifics: ["Brand"] }).patch.item_specifics).toBeUndefined();
  });
});

describe('the inch mark format (12 Nov 2026): Approximately 13.5"H x 16.5"W x 6.25"D', () => {
  it("measurement lines with the inch mark stay together right after Condition", async () => {
    const { formatDescription } = await import("@/lib/description-format");
    const r = formatDescription(
      'T\n\nBrand: Coach\n\nColor: Black.\n\nCondition: Pre-owned, excellent.\n\nMeasurements: Approximately 13.5"H x 16.5"W x 6.25"D (34.3 H x 41.9 W x 15.9 D cm)\n\nStrap drop: Approximately 9" (22.9 cm)',
    );
    expect(r.text).toBe(
      'T\n\nBrand: Coach\n\nCondition: Pre-owned, excellent.\n\nMeasurements: Approximately 13.5"H x 16.5"W x 6.25"D (34.3 H x 41.9 W x 15.9 D cm)\nStrap drop: Approximately 9" (22.9 cm)\n\nColor: Black.',
    );
  });
  it('Length: Approximately 1.5" (3.8 cm) answers Item Length 1.5 in', () => {
    const aspect = { name: "Item Length", values: [], mode: "FREE_TEXT" } as never;
    expect(sellerTextSupports("1.5 in", aspect, { description: 'T\n\nLength: Approximately 1.5" (3.8 cm)' })).toBe(true);
  });
});
