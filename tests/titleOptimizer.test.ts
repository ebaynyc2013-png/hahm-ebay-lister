import { describe, expect, test } from "vitest";
import { optimizeTitle, EBAY_TITLE_LIMIT } from "@/lib/titleOptimizer";
import type { ListingResult } from "@/lib/types";

const base: ListingResult = { title: "", description: "" };

describe("optimizeTitle", () => {
  test("NEVER removes words — repeated names are legitimate", () => {
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

  test("rejects a title longer than eBay's 80-character limit", () => {
    const title = "A".repeat(EBAY_TITLE_LIMIT + 1);

    expect(() => optimizeTitle({ ...base, title })).toThrow(
      "Generated title exceeds eBay's 80-character limit.",
    );
  });
});
