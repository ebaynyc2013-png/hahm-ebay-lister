import { expect, it } from "vitest";
import { applyListingDefaults } from "@/lib/listing-defaults";
import type { ListingResult } from "@/lib/types";
import type { AspectMeta } from "@/lib/ebay/taxonomy";
const meta: AspectMeta[] = [
  {
    name: "Size Type",
    values: ["Regular", "Petite"],
    mode: "SELECTION_ONLY",
    required: true,
    usage: "REQUIRED",
    cardinality: "SINGLE",
  },
];
it("fills the seller's Regular and Pre-owned Excellent for an excellent piece", () => {
  const l: ListingResult = {
    title: "Shirt",
    description: "",
    condition: "EXCELLENT",
    evidence: { "Size Type": [1] },
  };
  applyListingDefaults(l, meta, new Set([2990, 3000]));
  expect(l.item_specifics?.["Size Type"]).toBe("Regular");
  expect(l.ebay_condition).toBe("PRE_OWNED_EXCELLENT");
  expect(l.condition).toBe("EXCELLENT");
  expect(l.evidence?.["Size Type"]).toBeUndefined();
});
it("the eBay condition follows the AI's grade, so the menu and the texts agree (31 Oct 2026)", () => {
  const good: ListingResult = { title: "Shirt", description: "", condition: "GOOD" };
  applyListingDefaults(good, meta, new Set([2990, 3000, 3010]));
  expect(good.ebay_condition).toBe("USED_EXCELLENT"); // Pre-owned Good in clothing
  expect(good.condition).toBe("GOOD");

  const fair: ListingResult = { title: "Shirt", description: "", condition: "FAIR" };
  applyListingDefaults(fair, meta, new Set([2990, 3000, 3010]));
  expect(fair.ebay_condition).toBe("PRE_OWNED_FAIR");

  const none: ListingResult = { title: "Shirt", description: "" };
  applyListingDefaults(none, meta, new Set([2990, 3000]));
  expect(none.ebay_condition).toBe("PRE_OWNED_EXCELLENT");
  expect(none.condition).toBe("EXCELLENT");
});
it("preserves a seller's alternate size and new-condition choice on repeated preparation", () => {
  const l: ListingResult = {
    title: "Shirt",
    description: "",
    item_specifics: { "Size Type": "Petite" },
    ebay_condition: "NEW",
    condition: "NEW_WITH_TAGS",
  };
  applyListingDefaults(l, meta, new Set([1000, 2990]));
  expect(l.item_specifics?.["Size Type"]).toBe("Petite");
  expect(l.ebay_condition).toBe("NEW");
  expect(l.condition).toBe("NEW_WITH_TAGS");
});
it("does not relabel Good as Excellent or add unsupported size types", () => {
  const l: ListingResult = { title: "Item", description: "" };
  applyListingDefaults(l, [], new Set([3000]));
  expect(l.ebay_condition).toBeUndefined();
  expect(l.item_specifics).toBeUndefined();
});

const customized = (values: string[]): AspectMeta => ({
  name: "Customized",
  values,
  mode: "FREE_TEXT",
  required: false,
  usage: "RECOMMENDED",
  cardinality: "SINGLE",
});
it("answers Customized with No wherever eBay asks it", () => {
  // The seller almost never sells a customized piece (27 Oct 2026).
  const l: ListingResult = { title: "Pumps", description: "" };
  applyListingDefaults(l, [customized(["No", "Yes"])], new Set());
  expect(l.item_specifics?.Customized).toBe("No");
});
it("keeps a Customized answer the seller already gave", () => {
  const l: ListingResult = {
    title: "Engraved ring",
    description: "",
    item_specifics: { Customized: "Yes" },
  };
  applyListingDefaults(l, [customized(["No", "Yes"])], new Set());
  expect(l.item_specifics?.Customized).toBe("Yes");
});
it("adds no Customized where eBay does not ask, or offers no No", () => {
  const a: ListingResult = { title: "Painting", description: "" };
  applyListingDefaults(a, [], new Set());
  expect(a.item_specifics?.Customized).toBeUndefined();
  const b: ListingResult = { title: "Odd", description: "" };
  applyListingDefaults(b, [customized(["Yes"])], new Set());
  expect(b.item_specifics?.Customized).toBeUndefined();
});
