import { describe, expect, it } from "vitest";
import {
  conditionLine,
  ebayConditionForGrade,
  excellentWithoutFlaw,
  flawLines,
  gradeChange,
  gradeForEbayCondition,
  noteParts,
  notesForGrade,
  tidyConditionNotes,
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
    expect(l.condition_notes?.startsWith("Excellent pre-owned condition: • ")).toBe(true);
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
    expect(patch.condition_notes?.startsWith("Excellent pre-owned condition: • ")).toBe(true);
    expect(patch.condition_notes).not.toContain("\n");
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

describe("condition notes in one line (the seller, 12 Nov 2026)", () => {
  it("grade, colon, then the points with bullets — no 'looks great'", () => {
    expect(
      tidyConditionNotes(
        "Excellent pre-owned condition — looks great.\n• Bright, high polish on the cross\n• Serpentine chain is smooth with no kinks\n• Spring ring clasp opens and closes fine",
        "EXCELLENT",
      ),
    ).toBe(
      "Excellent pre-owned condition: • Bright, high polish on the cross • Serpentine chain is smooth with no kinks • Spring ring clasp opens and closes fine",
    );
  });
  it("vintage stays vintage", () => {
    expect(tidyConditionNotes("Excellent vintage condition: • All stones in place", "EXCELLENT")).toBe(
      "Excellent vintage condition: • All stones in place",
    );
  });
  it("Excellent and Good keep up to 3 points, every flaw kept", () => {
    const out = tidyConditionNotes(
      "Good pre-owned condition: • Colour still rich • Neat stitching • All buttons present • Seams intact • Light pilling under the arms",
      "GOOD",
    );
    expect(out).toBe("Good pre-owned condition: • Colour still rich • Neat stitching • Light pilling under the arms");
    expect(flawLines(out)).toEqual(["Light pilling under the arms"]);
  });
  it("Fair keeps up to 5 points", () => {
    const pts = ["A small hole by the hem", "Fading on the back", "Pilling on the sleeves", "Loose button", "Stain on the collar", "Seams intact"];
    const out = tidyConditionNotes(`Fair pre-owned condition: ${pts.map((p) => `• ${p}`).join(" ")}`, "FAIR");
    expect(noteParts(out).points).toHaveLength(5);
  });
  it("changing the grade rewrites only the opening", () => {
    expect(notesForGrade("Excellent pre-owned condition: • Small spot on the left cuff", "GOOD")).toBe(
      "Good pre-owned condition: • Small spot on the left cuff",
    );
  });
});

describe("eBay's condition menu in words, every category (12 Nov 2026)", () => {
  it("never shows eBay's code words", async () => {
    const { conditionMenuLabel } = await import("@/lib/condition-sync");
    const jewelry = ["NEW", "NEW_OTHER", "USED_EXCELLENT"];
    expect(conditionMenuLabel("USED_EXCELLENT", jewelry)).toBe("Pre-owned");
    expect(conditionMenuLabel("NEW", jewelry)).toBe("New");
    expect(conditionMenuLabel("USED_EXCELLENT", apparel)).toBe("Pre-owned · Good");
    expect(conditionMenuLabel("PRE_OWNED_EXCELLENT", apparel)).toBe("Pre-owned · Excellent");
    expect(conditionMenuLabel("NEW", apparel)).toBe("New with tags");
    const phones = ["NEW", "USED_EXCELLENT", "USED_VERY_GOOD", "USED_GOOD", "USED_ACCEPTABLE", "FOR_PARTS_OR_NOT_WORKING"];
    expect(phones.map((v) => conditionMenuLabel(v, phones))).toEqual([
      "New",
      "Pre-owned",
      "Used · Very Good",
      "Used · Good",
      "Used · Acceptable",
      "For parts or not working",
    ]);
  });
});
