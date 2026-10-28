import { describe, expect, it } from "vitest";
import {
  cleanEtsyTags,
  cleanHashtags,
  etsyTagLine,
  hashtagLine,
  tagEvidence,
} from "@/lib/marketplace-tags";
import { isAestheticHashtag } from "@/lib/aesthetics";

const KARAT = { karat: true, sterling: false };
const STERLING = { karat: false, sterling: true };

describe("Etsy tags are ones Etsy accepts when pasted", () => {
  it("keeps 13 tags of at most 20 characters, in order, no repeats", () => {
    const tags = cleanEtsyTags(
      [
        "Cord Necklace",
        "vintage pendant necklace", // 24 characters — Etsy refuses it
        "Tiffany & Co",
        "boho/hippie",
        "cord necklace", // repeat
        "Châtelaine",
        "mom’s gift",
        "#boho",
        "a, b",
        ...Array.from({ length: 10 }, (_, i) => `tag ${i}`),
      ],
      KARAT,
    );
    expect(tags.slice(0, 7)).toEqual([
      "cord necklace",
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
    expect(etsyTagLine(tags.slice(0, 2))).toBe("cord necklace, tiffany and co");
  });

  it("says gold tone and silver tone unless a karat or sterling mark is seen", () => {
    // The Premier Designs pendant is gold-plated, not gold (the seller, 28 Oct 2026).
    expect(cleanEtsyTags(["gold pendant", "silver ring", "gold tone chain", "gold-plated cuff"])).toEqual([
      "gold tone pendant",
      "silver tone ring",
      "gold tone chain",
      "gold-plated cuff",
    ]);
    expect(cleanEtsyTags(["14k gold pendant"], KARAT)).toEqual(["14k gold pendant"]);
    expect(cleanEtsyTags(["sterling silver ring"], STERLING)).toEqual(["sterling silver ring"]);
    expect(cleanEtsyTags(["sterling silver ring"])).toEqual(["silver tone ring"]);
  });

  it("copes with nothing", () => {
    expect(cleanEtsyTags(undefined)).toEqual([]);
    expect(cleanHashtags("not a list")).toEqual([]);
  });
});

describe("hashtags: 1–2 say what it is, 3–5 are aesthetics (the seller, 28 Oct 2026)", () => {
  it("puts them in her order whatever order the model wrote", () => {
    const tags = cleanHashtags(
      ["#mobwife", "#pendantnecklace", "#phoebebuffaystyle", "#cordnecklace", "#bohemian"],
      KARAT,
      isAestheticHashtag,
    );
    expect(tags).toEqual([
      "#pendantnecklace",
      "#cordnecklace",
      "#mobwife",
      "#phoebebuffaystyle",
      "#bohemian",
    ]);
    // Mercari takes the first three: two that say what it is, one aesthetic.
    expect(hashtagLine(tags.slice(0, 3))).toBe("#pendantnecklace #cordnecklace #mobwife");
  });

  it("fills with what-it-is tags when fewer aesthetics honestly fit", () => {
    expect(
      cleanHashtags(["#cigarettecase", "#engravedcigarettecase", "#oldmoney", "#retroglam", "#silvertonecase"], KARAT, isAestheticHashtag),
    ).toEqual(["#cigarettecase", "#engravedcigarettecase", "#oldmoney", "#retroglam", "#silvertonecase"]);
  });

  it("never says gold or silver without a mark", () => {
    expect(cleanHashtags(["#goldnecklace", "#hammeredgold", "#silverring", "#goldtonechain"])).toEqual([
      "#goldtonenecklace",
      "#hammeredgoldtone",
      "#silvertonering",
      "#goldtonechain",
    ]);
    expect(cleanHashtags(["#14kgoldring", "#goldnecklace"], KARAT)).toEqual(["#14kgoldring", "#goldnecklace"]);
  });

  it("drops a bare generic word, a size or a measurement", () => {
    expect(
      cleanHashtags(["#necklace", "#boho", "#vintage", "#3inchheels", "#18in", "#size7", "#strappysandals", "#90s", "#y2kstyle"], KARAT),
    ).toEqual(["#strappysandals", "#90s", "#y2kstyle"]);
  });

  it("joins words, lowercases, adds # and keeps no repeats", () => {
    expect(cleanHashtags(["Pendant Necklace", "#pendantnecklace", "Mob Wife"], KARAT, isAestheticHashtag)).toEqual([
      "#pendantnecklace",
      "#mobwife",
    ]);
  });
});

describe("reading the listing for a mark", () => {
  it("finds karat and sterling stamps, not a colour word", () => {
    expect(tagEvidence("Hallmarks: stamped 14K on the clasp")).toEqual({ karat: true, sterling: false });
    expect(tagEvidence("Stamped 925 THAILAND")).toEqual({ karat: false, sterling: true });
    expect(tagEvidence("Gold tone pendant on a brown cord. Color: Gold")).toEqual({ karat: false, sterling: false });
  });

  it("knows the catalogue's aesthetics as hashtags, with aliases", () => {
    for (const t of ["#mobwife", "#lightacademia", "#bohochic", "#y2k", "#mobwifeaesthetic", "#midcenturymodern"])
      expect(isAestheticHashtag(t), t).toBe(true);
    for (const t of ["#pendantnecklace", "#cigarettecase", "#westernboots"])
      expect(isAestheticHashtag(t), t).toBe(false);
  });
});
