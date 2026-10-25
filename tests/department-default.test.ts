import { describe, expect, it } from "vitest";
import {
  applyDefaultDepartment,
  departmentFromCategoryPath,
} from "@/lib/category-selection";
import { parseListing } from "@/lib/validation";

// eBay's Department list for Women's Heels (55793) and Sandals (62107),
// read from its Taxonomy API.
const WOMENS_SHOES = ["Women", "Teens", "Unisex Adults"];
const dept = (values: string[]) => [{ name: "Department", values }];

describe("the seller's default Department", () => {
  it("is Women when nothing else settled it", () => {
    // The real case: red satin heels came back with Department empty.
    const aspects: Record<string, string[]> = {};
    expect(applyDefaultDepartment(aspects, dept(WOMENS_SHOES))).toBe(true);
    expect(aspects.Department).toEqual(["Women"]);
  });

  it("never overrides what the path, the photos or the note decided", () => {
    const aspects: Record<string, string[]> = { Department: ["Men"] };
    expect(applyDefaultDepartment(aspects, dept(["Men", "Women"]))).toBe(false);
    expect(aspects.Department).toEqual(["Men"]);
  });

  it("only uses a value eBay offers in this category", () => {
    // eBay would reject "Women" where its list does not contain it.
    const aspects: Record<string, string[]> = {};
    expect(applyDefaultDepartment(aspects, dept(["Unisex Adults"]))).toBe(
      false,
    );
    expect(aspects.Department).toBeUndefined();
  });

  it("adds nothing where eBay does not ask for a Department", () => {
    // Fine-jewellery earrings carry 53 aspects and no Department among them.
    const aspects: Record<string, string[]> = {};
    expect(
      applyDefaultDepartment(aspects, [{ name: "Metal", values: ["Gold"] }]),
    ).toBe(false);
    expect(aspects.Department).toBeUndefined();
  });

  it("treats a blank value as unanswered", () => {
    const aspects: Record<string, string[]> = { Department: [" "] };
    expect(applyDefaultDepartment(aspects, dept(WOMENS_SHOES))).toBe(true);
    expect(aspects.Department).toEqual(["Women"]);
  });
});

describe("the category path kept beside the ID", () => {
  it("survives validation, so a second Prepare can still read it", () => {
    const l = parseListing({
      title: "Red heels",
      description: "",
      category_id: "55793",
      category_path:
        "Clothing, Shoes & Accessories > Women > Women's Shoes > Heels",
    });
    expect(l.category_path).toContain("Women's Shoes");
    expect(departmentFromCategoryPath(l.category_path ?? "", WOMENS_SHOES)).toBe(
      "Women",
    );
  });

  it("reads men's from a men's path, not the default", () => {
    expect(
      departmentFromCategoryPath(
        "Clothing, Shoes & Accessories > Men > Men's Clothing > Shirts",
        ["Men", "Unisex Adults"],
      ),
    ).toBe("Men");
  });
});
