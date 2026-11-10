import { describe, expect, it } from "vitest";
import { applyDefaultWholesale } from "@/lib/listing-defaults";

describe("Wholesale is always No (10 Nov 2026)", () => {
  const meta = [{ name: "Wholesale", values: ["Yes", "No"] }];

  it("fills an empty Wholesale with No", () => {
    const a: Record<string, string[]> = {};
    expect(applyDefaultWholesale(a, meta)).toBe(true);
    expect(a.Wholesale).toEqual(["No"]);
  });

  it("overrides any other answer", () => {
    const a: Record<string, string[]> = { Wholesale: ["Yes"] };
    applyDefaultWholesale(a, meta);
    expect(a.Wholesale).toEqual(["No"]);
  });

  it("does nothing where eBay does not ask", () => {
    const a: Record<string, string[]> = {};
    expect(applyDefaultWholesale(a, [{ name: "Handmade", values: ["Yes", "No"] }])).toBe(false);
    expect(a).toEqual({});
  });
});
