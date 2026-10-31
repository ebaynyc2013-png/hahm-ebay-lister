import { describe, expect, it } from "vitest";
import { pickSizeFromList, sizeFromList } from "@/lib/clothing-size";
import { teeInTitle } from "@/lib/title-tee";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

// eBay's Size list for women's tops (53159), first values, 31 Oct 2026.
const TOPS = ["3XS", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "S/M", "M/L", "L/XL", "0", "2", "4", "6", "8", "10", "38"];

describe("Size comes from eBay's own list (the seller, 31 Oct 2026)", () => {
  it("chooses eBay's letter for the seller's 'M Medium'", () => {
    expect(sizeFromList("M Medium", TOPS)).toBe("M");
    expect(sizeFromList("L Large", TOPS)).toBe("L");
    expect(sizeFromList("XS Extra Small", TOPS)).toBe("XS");
    expect(sizeFromList("XL Extra Large", TOPS)).toBe("XL");
    expect(sizeFromList("Marked M Medium", TOPS)).toBe("M");
  });

  it("knows the other spellings of a size", () => {
    expect(sizeFromList("Medium", TOPS)).toBe("M");
    expect(sizeFromList("m", TOPS)).toBe("M");
    expect(sizeFromList("XXL", TOPS)).toBe("2XL");
    expect(sizeFromList("X-Large", TOPS)).toBe("XL");
    expect(sizeFromList("Small/Medium", TOPS)).toBe("S/M");
    expect(sizeFromList("Size 8", TOPS)).toBe("8");
  });

  it("never takes a European size for an American one", () => {
    expect(sizeFromList("EU 38", TOPS)).toBeNull();
    expect(sizeFromList("38 EU", TOPS)).toBeNull();
    expect(sizeFromList("UK 10", TOPS)).toBeNull();
  });

  it("guesses nothing when the label is not plainly one value", () => {
    expect(sizeFromList("One Size", TOPS)).toBeNull();
    expect(sizeFromList("M 8", TOPS)).toBeNull();
    expect(sizeFromList("", TOPS)).toBeNull();
  });

  const meta = [
    { name: "Size", required: true, usage: "REQUIRED", mode: "FREE_TEXT", cardinality: "SINGLE", values: TOPS },
  ] as unknown as AspectMeta[];

  it("puts eBay's value in the field, or empties it so the card asks", () => {
    const a: Record<string, string[]> = { Size: ["M Medium"] };
    pickSizeFromList(a, meta, "M Medium");
    expect(a.Size).toEqual(["M"]);

    const eu: Record<string, string[]> = { Size: ["EU 38"] };
    pickSizeFromList(eu, meta, "EU 38");
    expect(eu.Size).toBeUndefined();

    const none: Record<string, string[]> = {};
    pickSizeFromList(none, meta, "L Large");
    expect(none.Size).toEqual(["L"]);
  });

  it("leaves categories without a Size list alone", () => {
    const a: Record<string, string[]> = { "Ring Size": ["7"] };
    pickSizeFromList(a, [], "7");
    expect(a).toEqual({ "Ring Size": ["7"] });
  });
});

describe("A T-shirt is 'T-Shirt Tee' in the title (the seller, 31 Oct 2026)", () => {
  it("puts Tee right after T-Shirt", () => {
    expect(
      teeInTitle("GreenHouse Gray Floral Viscose V-Neck Top T-Shirt M Medium Short Sleeve Boho"),
    ).toBe("GreenHouse Gray Floral Viscose V-Neck Top T-Shirt Tee M Medium Short Sleeve Boho");
    expect(teeInTitle("Nike Black Cotton T-Shirt L Large")).toBe("Nike Black Cotton T-Shirt Tee L Large");
    expect(teeInTitle("Vintage 90s Band Tshirt XL")).toBe("Vintage 90s Band Tshirt Tee XL");
  });

  it("adds nothing when Tee is there already or it does not fit in 80", () => {
    expect(teeInTitle("Floral T-Shirt Tee M Medium")).toBe("Floral T-Shirt Tee M Medium");
    expect(teeInTitle("Graphic Tee M Medium")).toBe("Graphic Tee M Medium");
    const full = `${"X".repeat(70)} T-Shirt M`;
    expect(teeInTitle(full)).toBe(full);
  });

  it("leaves a T-shirt dress a dress", () => {
    expect(teeInTitle("Gap Gray T-Shirt Dress M Medium")).toBe("Gap Gray T-Shirt Dress M Medium");
  });

  it("leaves titles of other things alone", () => {
    expect(teeInTitle("Premier Designs Gold Pendant Necklace")).toBe("Premier Designs Gold Pendant Necklace");
  });
});
