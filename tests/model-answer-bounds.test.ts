import { describe, expect, it } from "vitest";
import { finishListing } from "@/lib/analyze-core";
import { allDoubts } from "@/lib/listing-mismatch";
import { clipWords, parseDraftListing, parseListing } from "@/lib/validation";
import { draftIssues } from "@/lib/client-review";
import type { ItemGroup } from "@/lib/types";

// 21 Nov 2026: a check fed the program made-up AI answers with one entry too
// many. Every one of them failed the whole listing — after it was paid for.
// The worst was the title: over 80 characters, the listing failed (since the
// 13 Nov change that stopped titles being cut in the middle of a word).

const ctx = { imageCount: 3, phraseIds: [] as string[], profile: "general" };
const base = {
  title: "Sterling Silver Cross Pendant Necklace",
  description: "Sterling Silver Cross Pendant Necklace\n\nBrand: Unbranded",
  color: ["Silver"],
  search_terms: ["cross pendant"],
  doubts: [],
  specifics: [],
};
const many = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`);
const finish = (over: Record<string, unknown>) => finishListing(JSON.stringify({ ...base, ...over }), ctx);

describe("one entry too many never fails a listing (21 Nov 2026)", () => {
  it("a title over 80 characters is shortened by whole words, not refused", () => {
    const long = "Vintage Sterling Silver 925 Cross Pendant Necklace Women 18 Inch Chain Gift Religious Boho";
    expect(long.length).toBeGreaterThan(80);
    const l = finish({ title: long, description: `${long}\n\nBrand: Unbranded` });
    expect(l.title.length).toBeLessThanOrEqual(80);
    // Whole words from the start of her title, none cut in half.
    expect(long.startsWith(l.title)).toBe(true);
    expect(long[l.title.length]).toBe(" ");
    // The description still opens with the title, word for word.
    expect(l.description.split("\n")[0]).toBe(l.title);
  });

  it("the program's own lists keep their first entries", () => {
    const l = finish({
      search_terms: many(5, "term"),
      color: many(11, "Color"),
      key_features: many(11, "feature"),
      seo_keywords: many(11, "kw"),
      aesthetics: many(11, "Boho"),
    });
    expect(l.search_terms).toEqual(many(4, "term"));
    expect((l.color as string[]).length).toBeLessThanOrEqual(10);
    expect(l.key_features?.length).toBeLessThanOrEqual(10);
    expect(l.seo_keywords?.length).toBeLessThanOrEqual(10);
  });

  it("every doubt is kept and shown — nine of them, not six (her choice)", () => {
    const doubts = many(9, "Field").map((f) => ({ field: f, options: ["A", "B"], why: "not sure" }));
    const l = finish({ doubts });
    expect(l.doubts).toHaveLength(9);
    expect(allDoubts(l)).toHaveLength(9);
  });

  it("a doubt with seven choices keeps four, as before", () => {
    const l = finish({ doubts: [{ field: "Metal", options: many(7, "metal"), why: "x" }] });
    expect(l.doubts?.[0].options).toEqual(many(4, "metal"));
  });

  it("a long explanation loses whole words from its end", () => {
    const why = "The stamp could read 925 or 935 and the photo is soft ".repeat(8).trim();
    expect(why.length).toBeGreaterThan(300);
    const l = finish({
      doubts: [{ field: "Metal Purity", options: ["925", "935"], why }],
      brand_candidates: [{ brand: "Premier Designs", why }],
    });
    const kept = l.doubts?.[0].why ?? "";
    expect(kept.length).toBeLessThanOrEqual(300);
    expect(why.startsWith(kept)).toBe(true);
    expect(why[kept.length]).toBe(" ");
    expect(l.brand_candidates?.[0].why.length).toBeLessThanOrEqual(300);
  });

  it("maker's marks are never cut short; six possible brands no longer fail the listing", () => {
    const l = finish({
      maker_marks: many(11, "mark"),
      brand_candidates: many(6, "Brand").map((b) => ({ brand: b, why: "x" })),
    });
    expect(l.maker_marks).toHaveLength(11);
    // The card has always offered at most five possible brands (lib/maker-marks.ts);
    // that is unchanged — what changed is that a sixth no longer fails everything.
    expect(l.brand_candidates).toHaveLength(5);
  });
});

describe("her own title over 80 (21 Nov 2026)", () => {
  const title = "Premier Designs Silver Tone Statement Bib Necklace Rhinestone Crystal Vintage Look Gift";
  it("is read as a draft — Prepare, Update with notes and the search online don't fail on it", () => {
    expect(title.length).toBeGreaterThan(80);
    expect(parseDraftListing({ title, description: "x" }).title).toBe(title);
  });
  it("still never publishes: publishing reads 80 at most, and the check bar keeps Post shut", () => {
    expect(() => parseListing({ title, description: "x" })).toThrow();
    const g = { listing: { title, description: "x" }, photoIds: ["p"], sku: "" } as unknown as ItemGroup;
    expect(draftIssues(g)).toContain("Title must be 1–80 characters.");
  });
});

describe("clipWords", () => {
  it("keeps short text as it is and never cuts a word in half", () => {
    expect(clipWords("short", 10)).toBe("short");
    expect(clipWords("one two three", 9)).toBe("one two");
    expect(clipWords("abcdefghijkl", 5)).toBe("abcde");
  });
});
