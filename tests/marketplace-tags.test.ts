import { describe, expect, it } from "vitest";
import {
  cleanEtsyTags,
  cleanHashtags,
  etsyTagLine,
  hashtagLine,
} from "@/lib/marketplace-tags";

describe("Etsy tags are ones Etsy accepts when pasted", () => {
  it("keeps 13 tags of at most 20 characters, in order, no repeats", () => {
    const tags = cleanEtsyTags([
      "Gold Cord Necklace",
      "vintage gold pendant necklace", // 29 characters — Etsy refuses it
      "Tiffany & Co",
      "boho/hippie",
      "gold cord necklace", // repeat
      "Châtelaine",
      "mom’s gift",
      "#boho",
      "a, b",
      ...Array.from({ length: 10 }, (_, i) => `tag ${i}`),
    ]);
    expect(tags.slice(0, 7)).toEqual([
      "gold cord necklace",
      "tiffany and co",
      "boho hippie",
      "chatelaine",
      "mom's gift",
      "boho",
      "a b",
    ]);
    expect(tags).toHaveLength(13);
    for (const t of tags) {
      expect(t.length).toBeLessThanOrEqual(20);
      expect(t).toMatch(/^[a-z0-9' _-]+$/);
    }
    expect(etsyTagLine(tags.slice(0, 2))).toBe("gold cord necklace, tiffany and co");
  });

  it("copes with nothing", () => {
    expect(cleanEtsyTags(undefined)).toEqual([]);
    expect(cleanHashtags("not a list")).toEqual([]);
  });
});

describe("hashtags for Depop and Mercari", () => {
  it("joins words, lowercases, adds # and keeps the 5 most important", () => {
    const tags = cleanHashtags([
      "#Gold Necklace",
      "boho jewelry",
      "Premier Designs",
      "#goldnecklace", // repeat
      "hammered-gold",
      "statement necklace",
      "y2k",
      "1990",
    ]);
    expect(tags).toEqual([
      "#goldnecklace",
      "#bohojewelry",
      "#premierdesigns",
      "#hammeredgold",
      "#statementnecklace",
    ]);
    expect(hashtagLine(tags.slice(0, 3))).toBe("#goldnecklace #bohojewelry #premierdesigns");
  });
});
