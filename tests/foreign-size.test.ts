import { describe, expect, it } from "vitest";
import {
  foreignSizeInDescription,
  foreignSizeInTitle,
  parseForeignSize,
  womensForeignSize,
} from "@/lib/foreign-size";
import { pickSizeFromList } from "@/lib/clothing-size";
import { optimizeTitle } from "@/lib/titleOptimizer";
import type { AspectMeta } from "@/lib/ebay/taxonomy";
import type { ListingResult } from "@/lib/types";

// eBay's women's chart (pages.ebay.com/sell/sizechart.html), 31 Oct 2026.
const top = (over: Partial<ListingResult> = {}): ListingResult =>
  ({ title: "", description: "", item_type: "Top", size: "EU 38", ...over }) as ListingResult;

describe("European, British and Italian women's sizes from eBay's chart", () => {
  it("reads the size with its system and finds it on the chart", () => {
    expect(parseForeignSize("EU 38")).toEqual({ system: "EU", value: "38", us: "8", letter: "M", word: "Medium" });
    expect(parseForeignSize("38 EU")?.us).toBe("8");
    expect(parseForeignSize("UK 10")).toMatchObject({ us: "8", letter: "M" });
    expect(parseForeignSize("IT 44")).toMatchObject({ us: "8", letter: "M" });
    expect(parseForeignSize("EU 36")).toMatchObject({ us: "6", letter: "S", word: "Small" });
    expect(parseForeignSize("EU 42")).toMatchObject({ us: "12", letter: "L", word: "Large" });
    expect(parseForeignSize("EU 32")).toMatchObject({ us: "2", letter: "XS", word: "Extra Small" });
    expect(parseForeignSize("EU 46")).toMatchObject({ us: "16", letter: "XL", word: "Extra Large" });
    expect(parseForeignSize("EU 50")).toMatchObject({ us: "20", letter: "2XL", word: "2XL" });
  });

  it("converts nothing without a system, or off the chart", () => {
    expect(parseForeignSize("38")).toBeNull();
    expect(parseForeignSize("M Medium")).toBeNull();
    expect(parseForeignSize("EU 37")).toBeNull();
    expect(parseForeignSize("EU 60")).toBeNull();
  });

  it("is for women's clothing only — never men's, shoes or rings", () => {
    expect(womensForeignSize(top())).not.toBeNull();
    expect(womensForeignSize(top({ item_type: "Dress" }))).not.toBeNull();
    expect(womensForeignSize(top({ item_specifics: { Department: "Men" } }))).toBeNull();
    expect(womensForeignSize(top({ category: "mens_tops" }))).toBeNull();
    expect(womensForeignSize(top({ item_type: "Heels", size: "EU 38" }))).toBeNull();
    expect(womensForeignSize(top({ item_type: "Ring", size: "EU 50" }))).toBeNull();
  });

  it("title: EU 38 becomes EU 38 M Medium", () => {
    expect(
      foreignSizeInTitle("GreenHouse Gray Floral Viscose V-Neck Top EU 38 Short Sleeve", top()),
    ).toBe("GreenHouse Gray Floral Viscose V-Neck Top EU 38 M Medium Short Sleeve");
    expect(foreignSizeInTitle("Zara Black Blazer UK 10", top({ size: "UK 10", item_type: "Blazer" }))).toBe(
      "Zara Black Blazer UK 10 M Medium",
    );
    // Already complete — left as it is.
    expect(foreignSizeInTitle("Top EU 38 M Medium", top())).toBe("Top EU 38 M Medium");
  });

  it("title: when 80 is tight, EU 38 gives way and M Medium stays", () => {
    const t = `${"Word ".repeat(13)}Top EU 38`; // 74 characters
    const out = foreignSizeInTitle(t, top());
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith("Top M Medium")).toBe(true);
    expect(out).not.toContain("EU 38");
  });

  it("title: goes through the optimizer with the other rules", () => {
    expect(optimizeTitle(top({ title: "GreenHouse Floral Top T-Shirt EU 38 Boho", item_type: "Top" }))).toBe(
      "GreenHouse Floral Top T-Shirt Tee EU 38 M Medium Boho",
    );
  });

  it("description: Size: EU 38 (US 8, Medium), in place of the line written", () => {
    expect(foreignSizeInDescription("Title\n\nBrand: X\n\nSize: EU 38\n\nColor: Gray", top())).toBe(
      "Title\n\nBrand: X\n\nSize: EU 38 (US 8, Medium)\n\nColor: Gray",
    );
    expect(foreignSizeInDescription("Title\n\nBrand: X", top())).toBe(
      "Title\n\nBrand: X\n\nSize: EU 38 (US 8, Medium)",
    );
    // Men's or no European size: untouched.
    expect(foreignSizeInDescription("Size: EU 50", top({ size: "EU 50", item_specifics: { Department: "Men" } }))).toBe(
      "Size: EU 50",
    );
  });

  const meta = (values: string[]) =>
    [{ name: "Size", required: true, usage: "REQUIRED", mode: "FREE_TEXT", cardinality: "SINGLE", values }] as unknown as AspectMeta[];

  it("eBay's Size field: the letter, else the US number, else empty — never the bare 38", () => {
    const f = parseForeignSize("EU 38");
    const a: Record<string, string[]> = { Size: ["38"] };
    pickSizeFromList(a, meta(["S", "M", "L", "38"]), "EU 38", f);
    expect(a.Size).toEqual(["M"]);

    const numbers: Record<string, string[]> = { Size: ["38"] };
    pickSizeFromList(numbers, meta(["4", "6", "8", "38"]), "EU 38", f);
    expect(numbers.Size).toEqual(["8"]);

    const neither: Record<string, string[]> = { Size: ["38"] };
    pickSizeFromList(neither, meta(["One Size"]), "EU 38", f);
    expect(neither.Size).toBeUndefined();

    const xxs: Record<string, string[]> = {};
    pickSizeFromList(xxs, meta(["3XS", "2XS", "XS"]), "EU 28", parseForeignSize("EU 28"));
    expect(xxs.Size).toEqual(["2XS"]);
  });
});
