import { describe, expect, it } from "vitest";
import {
  buildSku,
  dateCode,
  nextIndexFromSkus,
  sanitizeSku,
  skuPrefix,
  withCost,
} from "@/lib/sku";

// The seller's format, 30 Oct 2026: 2026-10-30-1-COG12.
const OCT30 = new Date(2026, 9, 30, 20, 13);

describe("SKU: date, number of the day, cost of goods", () => {
  it("dates the SKU with the day the listing is made, year first", () => {
    expect(dateCode(OCT30)).toBe("2026-10-30");
    expect(dateCode(new Date(2027, 0, 5))).toBe("2027-01-05");
  });

  it("numbers the items of the day 1, 2, 3…", () => {
    const p = skuPrefix("", OCT30);
    expect(p).toBe("2026-10-30");
    expect(buildSku(p, 0)).toBe("2026-10-30-1");
    expect(buildSku(p, 1)).toBe("2026-10-30-2");
    expect(buildSku(p, 9)).toBe("2026-10-30-10");
  });

  it("puts a shelf or bin in front when she types one", () => {
    expect(buildSku(skuPrefix("B12", OCT30), 0)).toBe("B12-2026-10-30-1");
    expect(buildSku(skuPrefix("  ", OCT30), 0)).toBe("2026-10-30-1");
  });

  it("ends the SKU with the cost in whole dollars", () => {
    expect(withCost("2026-10-30-1", 12)).toBe("2026-10-30-1-COG12");
    expect(withCost("2026-10-30-1", 4.6)).toBe("2026-10-30-1-COG5");
    expect(withCost("2026-10-30-1", 0)).toBe("2026-10-30-1-COG0");
  });

  it("replaces the cost when it changes and takes it off when emptied", () => {
    expect(withCost("2026-10-30-1-COG12", 15)).toBe("2026-10-30-1-COG15");
    expect(withCost("2026-10-30-1-COG12", "")).toBe("2026-10-30-1");
    expect(withCost("2026-10-30-1", -3)).toBe("2026-10-30-1");
  });

  it("uses only letters, digits and hyphens — what every marketplace takes", () => {
    const sku = withCost(buildSku(skuPrefix("B12", OCT30), 3), 12);
    expect(sku).toBe("B12-2026-10-30-4-COG12");
    expect(sku).toMatch(/^[A-Za-z0-9-]+$/);
    expect(sanitizeSku(sku)).toBe(sku);
  });

  it("never runs past eBay's 50 characters, cost kept", () => {
    const long = "X".repeat(48);
    const sku = withCost(long, 125);
    expect(sku.length).toBeLessThanOrEqual(50);
    expect(sku.endsWith("-COG125")).toBe(true);
  });

  it("continues the numbering after SKUs already used that day", () => {
    const used = [
      "2026-10-30-1",
      "2026-10-30-4-COG12",
      "2026-10-30-2-COG5",
      "2026-10-29-9",
      "B12-2026-10-30-7",
      "A-d550ce345f0d",
    ];
    expect(nextIndexFromSkus(used, "2026-10-30")).toBe(4);
    expect(buildSku("2026-10-30", nextIndexFromSkus(used, "2026-10-30"))).toBe(
      "2026-10-30-5",
    );
    expect(nextIndexFromSkus(used, "B12-2026-10-30")).toBe(7);
    expect(nextIndexFromSkus(used, "2026-10-31")).toBe(0);
  });

  it("does not mistake another day for today", () => {
    expect(nextIndexFromSkus(["2026-10-3-9"], "2026-10-30")).toBe(0);
    expect(nextIndexFromSkus(["2026-10-30-9"], "2026-10-3")).toBe(0);
  });
});
