import { describe, expect, it } from "vitest";
import { departmentFromCategoryPath } from "@/lib/category-selection";

const ADULT = ["Men", "Women", "Unisex Adults"];
const KIDS = ["Boys", "Girls", "Unisex Kids"];

describe("departmentFromCategoryPath", () => {
  it("reads the department out of eBay's own path", () => {
    expect(
      departmentFromCategoryPath(
        "Clothing, Shoes & Accessories > Women > Women's Shoes > Sandals",
        ADULT,
      ),
    ).toBe("Women");
    expect(
      departmentFromCategoryPath(
        "Clothing, Shoes & Accessories > Men > Men's Shoes > Dress Shoes",
        ADULT,
      ),
    ).toBe("Men");
  });

  it("never reads Men out of Women's", () => {
    // "women" has no word boundary before "men", which is the whole reason
    // the match is anchored on \b.
    expect(
      departmentFromCategoryPath(
        "Clothing, Shoes & Accessories > Women > Women's Clothing > Dresses",
        ["Men"],
      ),
    ).toBe("");
  });

  it("handles possessives and kids' departments", () => {
    expect(
      departmentFromCategoryPath(
        "Clothing, Shoes & Accessories > Kids > Girls' Shoes",
        KIDS,
      ),
    ).toBe("Girls");
    expect(
      departmentFromCategoryPath("Baby & Toddler Clothing > Baby Boys", KIDS),
    ).toBe("Boys");
  });

  it("prefers the most specific allowed value", () => {
    expect(
      departmentFromCategoryPath(
        "Clothing, Shoes & Accessories > Unisex Adults > Shirts",
        ["Unisex", "Unisex Adults"],
      ),
    ).toBe("Unisex Adults");
  });

  it("returns nothing when the path names no department", () => {
    expect(
      departmentFromCategoryPath(
        "Collectibles > Tobacciana > Lighters > Vintage",
        ADULT,
      ),
    ).toBe("");
    expect(
      departmentFromCategoryPath(
        "Art > Art Prints > Signed Lithographs",
        ADULT,
      ),
    ).toBe("");
  });

  it("only ever returns a value eBay allows for this category", () => {
    // The path says Women, but this category's Department aspect does not
    // offer it — better to leave it empty than to send eBay a rejected value.
    expect(
      departmentFromCategoryPath(
        "Clothing, Shoes & Accessories > Women > Women's Shoes",
        KIDS,
      ),
    ).toBe("");
    expect(departmentFromCategoryPath("Anything > Women", [])).toBe("");
    expect(departmentFromCategoryPath("", ADULT)).toBe("");
  });
});
