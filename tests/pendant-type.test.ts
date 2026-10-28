import { describe, expect, it } from "vitest";
import { applyDefaultPendantType } from "@/lib/listing-defaults";
import type { ListingResult } from "@/lib/types";

// eBay's list for Fashion Necklaces & Pendants (155101), read 28 Oct 2026.
const PENDANT_TYPE = {
  name: "Pendant/Locket Type",
  values: [
    "Alphabet/Letter", "Amulet", "Bar", "Charm", "Coin", "Dog Tag",
    "Floating/Keepsake", "Medal", "Perfume", "Photo", "Tassel",
  ],
};
const listing = (title: string, description = ""): ListingResult => ({ title, description });

describe("an ordinary pendant gets Charm — the seller's rule of 28 Oct 2026", () => {
  it("fills Charm for the Premier Designs abstract pendant", () => {
    const aspects: Record<string, string[]> = { Style: ["Pendant", "Statement"] };
    const done = applyDefaultPendantType(
      aspects,
      [PENDANT_TYPE],
      listing("Premier Designs Gold Brown Good As Gold Abstract Pendant Cord Necklace"),
    );
    expect(done).toBe(true);
    expect(aspects["Pendant/Locket Type"]).toEqual(["Charm"]);
  });

  it("never overwrites a kind the photos showed", () => {
    const aspects = { "Pendant/Locket Type": ["Coin"] };
    expect(applyDefaultPendantType(aspects, [PENDANT_TYPE], listing("Gold Coin Pendant Necklace"))).toBe(false);
    expect(aspects["Pendant/Locket Type"]).toEqual(["Coin"]);
  });

  it("leaves it empty for a special kind it cannot name, or a plain chain", () => {
    for (const title of [
      "Sterling Silver Photo Locket Pendant Necklace",
      "Gold Initial Letter A Pendant Necklace",
      "Vintage Tassel Pendant Necklace",
      "14K Gold Rope Chain Necklace 20in",
    ]) {
      const aspects: Record<string, string[]> = {};
      expect(applyDefaultPendantType(aspects, [PENDANT_TYPE], listing(title)), title).toBe(false);
      expect(aspects["Pendant/Locket Type"], title).toBeUndefined();
    }
  });

  it("does nothing where eBay does not ask, or offers no Charm", () => {
    const aspects: Record<string, string[]> = {};
    expect(applyDefaultPendantType(aspects, [], listing("Gold Pendant Necklace"))).toBe(false);
    expect(
      applyDefaultPendantType(
        aspects,
        [{ name: "Pendant/Locket Type", values: ["Coin", "Bar"] }],
        listing("Gold Pendant Necklace"),
      ),
    ).toBe(false);
    expect(aspects).toEqual({});
  });
});

describe("the photo pass is told the same rule", () => {
  it("names Charm for an ordinary decorative pendant", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("lib/ebay/aspectFill.ts", "utf8");
    expect(src).toContain('For an ordinary decorative pendant that none of those describes, answer "Charm"');
  });
});

describe("the general rule: not sure of the exact value — the general one", () => {
  it("is in the photo pass for every category, and keeps label facts out", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("lib/ebay/aspectFill.ts", "utf8");
    expect(src).toContain("NOT SURE WHICH EXACT VALUE? CHOOSE THE GENERAL ONE.");
    expect(src).toContain("a ring's Type, a bag's Style, a vase's Type");
    expect(src).toContain("those are never guessed");
  });
});
