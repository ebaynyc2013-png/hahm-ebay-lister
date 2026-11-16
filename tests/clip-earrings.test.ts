import { describe, expect, it } from "vitest";
import { applyClipEarrings, isClipEarring, withoutStudForClips } from "@/lib/clip-earrings";
import { STYLE_PHRASES } from "@/lib/style-phrases";

// eBay's Style list for earrings (50647), read from its Taxonomy API: no Clip-On.
const STYLE = {
  name: "Style",
  cardinality: "MULTI",
  values: ["Beaded", "Chandelier", "Climber", "Cuff", "Dangle/Drop", "Hoop", "Huggie", "Jacket", "Stud", "Tassel"],
};
const CLOSURE = { name: "Closure", cardinality: "SINGLE", values: ["Butterfly", "Clip-On", "Hook", "Lever Back", "Push Back", "Screw Back"] };
const PATH = "Jewelry & Watches > Fashion Jewelry > Earrings";

describe("clip-on earrings are not studs (the seller, 16 Nov 2026)", () => {
  it("knows a clip from a pierced earring", () => {
    expect(isClipEarring({ title: "Vintage Chr Dior Rhinestone Leaf Clip Earrings Gold Tone" })).toBe(true);
    expect(isClipEarring({ title: "Gold Tone Button Earrings", seller_notes: "clip on, clips work" })).toBe(true);
    expect(isClipEarring({ title: "Napier Non-Pierced Earrings" })).toBe(true);
    expect(isClipEarring({ title: "Crystal Earrings" }, PATH)).toBe(false);
    expect(isClipEarring({ title: "Sterling Silver Stud Earrings" })).toBe(false);
    // An omega back is a post through the ear with a clip behind it.
    expect(isClipEarring({ title: "18K Gold Earrings", description: "Omega clip backs." })).toBe(false);
    // Not earrings at all.
    expect(isClipEarring({ title: "Sterling Silver Money Clip" })).toBe(false);
  });

  it("takes Stud out of Style and keeps the true form", () => {
    const a: Record<string, string[]> = { Style: ["Stud", "Dangle/Drop"] };
    expect(applyClipEarrings(a, [STYLE], { title: "Leaf Clip Earrings" }, PATH)).toBe(true);
    expect(a.Style).toEqual(["Dangle/Drop"]);
  });

  it("leaves Style empty when Stud was all it had", () => {
    const a: Record<string, string[]> = { Style: ["Stud"] };
    applyClipEarrings(a, [STYLE], { title: "Button Clip Earrings" }, PATH);
    expect(a.Style).toBeUndefined();
  });

  it("puts Clip-On where eBay's own list has it", () => {
    const a: Record<string, string[]> = { Style: ["Stud"], Closure: ["Push Back"] };
    applyClipEarrings(a, [STYLE, CLOSURE], { title: "Button Clip Earrings" }, PATH);
    expect(a.Closure).toEqual(["Clip-On"]);
    // A screw back clip keeps its screw back.
    const b: Record<string, string[]> = { Closure: ["Screw Back"] };
    applyClipEarrings(b, [STYLE, CLOSURE], { title: "Screwback Clip Earrings" }, PATH);
    expect(b.Closure).toEqual(["Screw Back"]);
    // No field offers it: nothing invented.
    const c: Record<string, string[]> = {};
    applyClipEarrings(c, [STYLE], { title: "Clip Earrings" }, PATH);
    expect(c).toEqual({});
  });

  it("touches nothing on pierced earrings", () => {
    const a: Record<string, string[]> = { Style: ["Stud"], Closure: ["Push Back"] };
    expect(applyClipEarrings(a, [STYLE, CLOSURE], { title: "Diamond Stud Earrings" }, PATH)).toBe(false);
    expect(a).toEqual({ Style: ["Stud"], Closure: ["Push Back"] });
  });

  it("keeps Stud out after Update with notes too", () => {
    expect(withoutStudForClips({ Style: "Stud | Hoop", Metal: "Gold" }, { title: "Hoop Clip Earrings" })).toEqual({ Style: "Hoop", Metal: "Gold" });
    expect(withoutStudForClips({ Style: "Stud" }, { title: "Clip Earrings" })).toEqual({});
    expect(withoutStudForClips({ Style: "Stud" }, { title: "Stud Earrings" })).toEqual({ Style: "Stud" });
  });
});

describe("the broken phrases are gone (16 Nov 2026)", () => {
  it("has no fragment and no repeat", () => {
    for (const id of ["bracelets-31", "bracelets-32", "bracelets-33"])
      expect(STYLE_PHRASES.some((p) => p.id === id)).toBe(false);
    const texts = STYLE_PHRASES.map((p) => p.text.replace(/\bhave\b/g, "has"));
    expect(new Set(texts).size).toBe(texts.length);
  });
});
