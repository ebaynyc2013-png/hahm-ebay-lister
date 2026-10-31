import { describe, expect, it } from "vitest";
import {
  conditionLine,
  ebayConditionForGrade,
  excellentWithoutFlaw,
  flawLines,
  gradeChange,
  gradeForEbayCondition,
} from "@/lib/condition-sync";
import type { ListingResult } from "@/lib/types";

const apparel = ["NEW", "NEW_OTHER", "NEW_WITH_DEFECTS", "PRE_OWNED_EXCELLENT", "USED_EXCELLENT", "PRE_OWNED_FAIR"];
const general = ["NEW", "NEW_OTHER", "USED_EXCELLENT", "USED_VERY_GOOD", "USED_GOOD", "USED_ACCEPTABLE", "FOR_PARTS_OR_NOT_WORKING"];

// The GreenHouse top, 31 Oct 2026: nothing wrong named, graded down anyway.
const top = (): ListingResult => ({
  title: "GreenHouse Blue Floral Top",
  description: "GreenHouse Blue Floral Top\n\nCondition: Pre-owned, very good.\n\nSize: M",
  condition: "VERY_GOOD",
  condition_notes:
    "Good pre-owned condition — lightly worn.\n• Faded text print on the front is part of the design\n• Silver metallic ribbed trim at neckline and cuffs intact\n• Light pink stripe sleeve panels and sheer floral back in good shape\n• Seams and stitching intact\n• No holes or pulls",
});

describe("eBay's menu follows the grade", () => {
  it("clothing: Excellent is Pre-owned Excellent, Good is Pre-owned Good, Fair is Pre-owned Fair", () => {
    expect(ebayConditionForGrade("EXCELLENT", apparel)).toBe("PRE_OWNED_EXCELLENT");
    expect(ebayConditionForGrade("GOOD", apparel)).toBe("USED_EXCELLENT");
    expect(ebayConditionForGrade("VERY_GOOD", apparel)).toBe("USED_EXCELLENT");
    expect(ebayConditionForGrade("FAIR", apparel)).toBe("PRE_OWNED_FAIR");
    expect(ebayConditionForGrade("NEW_WITH_TAGS", apparel)).toBe("NEW");
  });
  it("other categories use eBay's general scale", () => {
    expect(ebayConditionForGrade("EXCELLENT", general)).toBe("USED_EXCELLENT");
    expect(ebayConditionForGrade("GOOD", general)).toBe("USED_GOOD");
    expect(ebayConditionForGrade("FAIR", general)).toBe("USED_ACCEPTABLE");
    expect(ebayConditionForGrade("EXCELLENT", [])).toBe("");
  });
  it("and the grade follows eBay's menu", () => {
    expect(gradeForEbayCondition("PRE_OWNED_EXCELLENT", apparel)).toBe("EXCELLENT");
    expect(gradeForEbayCondition("USED_EXCELLENT", apparel)).toBe("GOOD");
    expect(gradeForEbayCondition("USED_EXCELLENT", general)).toBe("EXCELLENT");
    expect(gradeForEbayCondition("PRE_OWNED_FAIR", apparel)).toBe("FAIR");
    expect(gradeForEbayCondition("NEW", apparel)).toBe("NEW_WITH_TAGS");
  });
});

describe("flaws named in the notes", () => {
  it("finds wear and damage, not what is absent or intended", () => {
    expect(flawLines(top().condition_notes)).toEqual([]);
    expect(
      flawLines("Good pre-owned condition — lightly worn.\n• Light pilling under the arms\n• Small spot on the left cuff\n• All buttons present, seams intact\n• No stains, holes or pulls"),
    ).toEqual(["Light pilling under the arms", "Small spot on the left cuff"]);
  });
});

describe("a grade below Excellent with no flaw named is Excellent", () => {
  it("the top comes back Excellent, with both texts saying so", () => {
    const l = top();
    expect(excellentWithoutFlaw(l)).toBe(true);
    expect(l.condition).toBe("EXCELLENT");
    expect(l.condition_notes?.split("\n")[0]).toBe("Excellent pre-owned condition — looks great.");
    expect(l.condition_notes).toContain("• No holes or pulls");
    expect(l.description).toContain("Condition: Pre-owned, excellent, nothing is wrong with it.");
    expect(l.description).not.toContain("very good");
  });
  it("a named flaw keeps the grade", () => {
    const l = { ...top(), condition: "GOOD", condition_notes: "Good pre-owned condition — lightly worn.\n• Small spot on the left cuff" };
    expect(excellentWithoutFlaw(l)).toBe(false);
    expect(l.condition).toBe("GOOD");
  });
  it("Excellent and New are never touched", () => {
    expect(excellentWithoutFlaw({ ...top(), condition: "EXCELLENT" })).toBe(false);
    expect(excellentWithoutFlaw({ ...top(), condition: "NEW_WITH_TAGS" })).toBe(false);
  });
});

describe("changing the grade on the card", () => {
  it("menu, description line and notes' first line change together; the bullets stay", () => {
    const patch = gradeChange(top(), "EXCELLENT", apparel);
    expect(patch.ebay_condition).toBe("PRE_OWNED_EXCELLENT");
    expect(patch.description).toContain("Condition: Pre-owned, excellent, nothing is wrong with it.");
    expect(patch.condition_notes?.split("\n")[0]).toBe("Excellent pre-owned condition — looks great.");
    expect(patch.condition_notes).toContain("• Seams and stitching intact");
  });
  it("Good with a flaw in the notes names it in the description", () => {
    const l = { ...top(), condition_notes: "Excellent pre-owned condition — looks great.\n• Small spot on the left cuff" };
    expect(gradeChange(l, "GOOD", apparel).description).toContain("Condition: Pre-owned, good, small spot on the left cuff.");
    expect(conditionLine("GOOD")).toBe("Condition: Pre-owned, good.");
  });
  it("before Prepare, eBay's menu waits", () => {
    expect(gradeChange(top(), "EXCELLENT").ebay_condition).toBe("");
  });
});
