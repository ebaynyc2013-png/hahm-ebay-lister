import { describe, expect, it } from "vitest";
import { fixDetailPlaces, movePlace, placeFromViews } from "@/lib/detail-places";
import { foreignSizeInTitle } from "@/lib/foreign-size";
import type { ListingResult } from "@/lib/types";

// The Prada trousers, 1 Nov 2026: the tape runs down the middle of the back
// panels; the analysis called it side trim.
const views = [
  { photo: 1, view: "note" },
  { photo: 2, view: "front" },
  { photo: 3, view: "back" },
  { photo: 4, view: "front" },
  { photo: 5, view: "back" },
  { photo: 8, view: "label" },
];

describe("where a detail is, from the photos it is seen on", () => {
  it("photos that all show the back say back", () => {
    expect(placeFromViews([3, 5], views)).toBe("back");
    expect(placeFromViews([2, 3], views)).toBeNull();
    expect(placeFromViews([1, 8], views)).toBeNull();
  });
  it("moves the place word for this detail only", () => {
    expect(movePlace("Prada Black Dress Pants IT 36 Side Tape Trim Trousers", "tape trim", "side", "back")).toBe(
      "Prada Black Dress Pants IT 36 Back Tape Trim Trousers",
    );
    expect(movePlace("a woven side tape trim running down both legs", "side tape trim", "side", "back")).toBe(
      "a woven back tape trim running down both legs",
    );
    expect(movePlace("side pockets and side tape trim", "tape trim", "side", "back")).toBe("side pockets and back tape trim");
  });
  it("the Prada listing comes out with Back everywhere it said Side", () => {
    const l: ListingResult = {
      title: "Prada Black Straight Leg Dress Pants IT 36 Side Tape Trim Trousers Office Siren",
      description: "Details: flat front, welt back pockets and a woven side tape trim running down both legs.",
      condition_notes: "Excellent pre-owned condition — looks like new.\n• Woven side tape trim down both legs intact",
      key_features: ["Side tape trim running down both legs", "Side pockets"],
    };
    const changed = fixDetailPlaces(l, views, [
      { detail: "side tape trim", place: "side", photos: [3, 5] },
      { detail: "side pockets", place: "side", photos: [2, 4] }, // front views: front pockets, but views disagree with nothing here
    ]);
    expect(l.title).toBe("Prada Black Straight Leg Dress Pants IT 36 Back Tape Trim Trousers Office Siren");
    expect(l.description).toContain("woven back tape trim");
    expect(l.condition_notes).toContain("• Woven back tape trim");
    expect(l.key_features?.[0]).toBe("Back tape trim running down both legs");
    expect(changed[0]).toBe("side tape trim: side → back");
  });
  it("nothing changes when the photos agree, or say nothing", () => {
    const l: ListingResult = { title: "Dress Side Slit", description: "" };
    fixDetailPlaces(l, [{ photo: 2, view: "side" }], [{ detail: "slit", place: "side", photos: [2] }]);
    expect(l.title).toBe("Dress Side Slit");
    fixDetailPlaces(l, undefined, undefined);
    expect(l.title).toBe("Dress Side Slit");
  });
});

describe("the American size goes in before the aesthetic tail", () => {
  it("Office Siren gives way to XS X-Small", () => {
    const l: ListingResult = {
      title: "",
      description: "",
      brand: "Prada",
      item_type: "Pants",
      size: "IT 36",
      aesthetics: ["Office Siren", "Minimalist"],
    };
    expect(
      foreignSizeInTitle("Prada Black Straight Leg Dress Pants IT 36 Back Tape Trim Trousers Office Siren", l),
    ).toBe("Prada Black Straight Leg Dress Pants IT 36 XS X-Small Back Tape Trim Trousers");
  });
});
