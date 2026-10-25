import { describe, expect, test } from "vitest";
import { optimizeTitle, EBAY_TITLE_LIMIT } from "@/lib/titleOptimizer";
import type { ListingResult } from "@/lib/types";

const base: ListingResult = { title: "", description: "" };

describe("optimizeTitle", () => {
  test("never removes ordinary words — repeated names are legitimate", () => {
    expect(optimizeTitle({ ...base, title: "BOSS Hugo Boss Wool Blazer" })).toBe(
      "BOSS Hugo Boss Wool Blazer"
    );
    expect(optimizeTitle({ ...base, title: "Duran Duran Rio Vinyl LP" })).toBe(
      "Duran Duran Rio Vinyl LP"
    );
    expect(optimizeTitle({ ...base, title: "Mickey & Minnie Salt & Pepper Shakers" })).toBe(
      "Mickey & Minnie Salt & Pepper Shakers"
    );
  });

  test("does not append brand, size, color, or other listing fields", () => {
    const t = optimizeTitle({
      ...base,
      title: "Ralph Lauren Cashmere Cardigan Size M",
      brand: "Ralph Lauren",
      size: "M",
      color: ["Black"],
      material: "Cashmere",
    });

    expect(t).toBe("Ralph Lauren Cashmere Cardigan Size M");
  });

  test("normalizes whitespace without rewriting the title", () => {
    const t = optimizeTitle({
      ...base,
      title: "Apple   iPhone 15 Pro   256GB Unlocked",
    });

    expect(t).toBe("Apple iPhone 15 Pro 256GB Unlocked");
  });

  test("accepts a title at the 80-character limit", () => {
    const title = "A".repeat(EBAY_TITLE_LIMIT);

    expect(optimizeTitle({ ...base, title })).toBe(title);
  });

  test("removes only the seller's never-in-the-title words", () => {
    expect(
      optimizeTitle({
        ...base,
        title: "DKNY Jeans Women's Blue Denim Shirt Dress L Large",
      }),
    ).toBe("DKNY Jeans Blue Denim Shirt Dress L Large");
    expect(
      optimizeTitle({
        ...base,
        title: "Vintage 90s Gap Pink Blazer Small Excellent Condition",
      }),
    ).toBe("Vintage 90s Gap Pink Blazer Small");
    expect(
      optimizeTitle({ ...base, title: "Floral Gypsy Maxi Dress M Medium Boho" }),
    ).toBe("Floral Maxi Dress M Medium Boho");
  });

  test("keeps Damaged and For Parts, which the seller wants", () => {
    expect(
      optimizeTitle({
        ...base,
        title: "Coach Black Leather Tote Bag Damaged",
      }),
    ).toBe("Coach Black Leather Tote Bag Damaged");
    expect(
      optimizeTitle({ ...base, title: "Apple iPhone 11 64GB Black For Parts" }),
    ).toBe("Apple iPhone 11 64GB Black For Parts");
  });

  test("never breaks a brand that contains a banned word", () => {
    expect(
      optimizeTitle({
        ...base,
        brand: "Woman Within",
        title: "Woman Within Navy Knit Cardigan 2X",
      }),
    ).toBe("Woman Within Navy Knit Cardigan 2X");
  });

  test("leaves a word that merely contains a banned one", () => {
    expect(
      optimizeTitle({ ...base, title: "Pink Barbiecore Mini Skirt XS" }),
    ).toBe("Pink Barbiecore Mini Skirt XS");
  });

  test("rejects a title longer than eBay's 80-character limit", () => {
    const title = "A".repeat(EBAY_TITLE_LIMIT + 1);

    expect(() => optimizeTitle({ ...base, title })).toThrow(
      "Generated title exceeds eBay's 80-character limit.",
    );
  });
});

describe("men's items", () => {
  test("drop Men's from the title too", () => {
    expect(
      optimizeTitle({ ...base, title: "Ralph Lauren Men's Navy Oxford Shirt L Large" }),
    ).toBe("Ralph Lauren Navy Oxford Shirt L Large");
  });

  test("keep a brand that carries the word", () => {
    expect(
      optimizeTitle({
        ...base,
        brand: "Men's Wearhouse",
        title: "Men's Wearhouse Black Suit Jacket 42R",
      }),
    ).toBe("Men's Wearhouse Black Suit Jacket 42R");
  });

  test("leave words that merely contain men alone", () => {
    // \b keeps "men" inside "Women" and "Menswear" alone.
    expect(optimizeTitle({ ...base, title: "Menswear Inspired Gray Blazer M Medium" })).toBe(
      "Menswear Inspired Gray Blazer M Medium",
    );
  });
});
