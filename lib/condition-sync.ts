// The grade, eBay's condition menu, the description's Condition line and the
// first line of the condition notes always agree — the seller's rule of 31 Oct
// 2026. Changing one on the card changes the others; and a grade below
// Excellent needs a flaw named in the notes, or it is Excellent.
//
// Client-safe: no server imports.

import type { ListingResult } from "./types";

type Grade =
  | "NEW_WITH_TAGS"
  | "NEW_NO_TAGS"
  | "EXCELLENT"
  | "VERY_GOOD"
  | "GOOD"
  | "FAIR"
  | "FOR_PARTS_OR_NOT_WORKING";

// eBay's condition values to try for a grade, in order — the same order the
// publisher uses (lib/ebay/publish.ts). Clothing categories are the ones that
// offer Pre-owned Excellent (2990); there 3000 means Pre-owned Good.
const APPAREL: Record<string, string[]> = {
  NEW_WITH_TAGS: ["NEW", "NEW_OTHER", "NEW_WITH_DEFECTS"],
  NEW_NO_TAGS: ["NEW_OTHER", "NEW", "NEW_WITH_DEFECTS"],
  EXCELLENT: ["PRE_OWNED_EXCELLENT"],
  VERY_GOOD: ["USED_EXCELLENT"],
  GOOD: ["USED_EXCELLENT"],
  FAIR: ["PRE_OWNED_FAIR", "USED_EXCELLENT"],
  FOR_PARTS_OR_NOT_WORKING: ["FOR_PARTS_OR_NOT_WORKING"],
};
const GENERAL: Record<string, string[]> = {
  NEW_WITH_TAGS: ["NEW", "NEW_OTHER", "NEW_WITH_DEFECTS"],
  NEW_NO_TAGS: ["NEW_OTHER", "NEW", "NEW_WITH_DEFECTS"],
  EXCELLENT: ["USED_EXCELLENT", "LIKE_NEW", "USED_VERY_GOOD", "USED_GOOD"],
  VERY_GOOD: ["USED_VERY_GOOD", "USED_EXCELLENT", "USED_GOOD", "LIKE_NEW"],
  GOOD: ["USED_GOOD", "USED_VERY_GOOD", "USED_EXCELLENT", "USED_ACCEPTABLE"],
  FAIR: ["USED_ACCEPTABLE", "USED_GOOD", "USED_VERY_GOOD", "USED_EXCELLENT"],
  FOR_PARTS_OR_NOT_WORKING: ["FOR_PARTS_OR_NOT_WORKING"],
};

const isApparel = (values: string[]) => values.includes("PRE_OWNED_EXCELLENT");

/** eBay's condition for the grade, among those this category accepts — or "". */
export function ebayConditionForGrade(grade: string | undefined, accepted: string[]): string {
  const table = isApparel(accepted) ? APPAREL : GENERAL;
  return (table[String(grade || "")] ?? []).find((v) => accepted.includes(v)) ?? "";
}

/** The grade for an eBay condition chosen in the menu. */
export function gradeForEbayCondition(value: string, accepted: string[]): Grade {
  switch (value) {
    case "NEW":
      return "NEW_WITH_TAGS";
    case "NEW_OTHER":
    case "NEW_WITH_DEFECTS":
      return "NEW_NO_TAGS";
    case "PRE_OWNED_EXCELLENT":
    case "LIKE_NEW":
      return "EXCELLENT";
    case "USED_EXCELLENT":
      // In clothing, 3000 is "Pre-owned Good".
      return isApparel(accepted) ? "GOOD" : "EXCELLENT";
    case "USED_VERY_GOOD":
      return "VERY_GOOD";
    case "USED_GOOD":
      return "GOOD";
    case "PRE_OWNED_FAIR":
    case "USED_ACCEPTABLE":
      return "FAIR";
    case "FOR_PARTS_OR_NOT_WORKING":
      return "FOR_PARTS_OR_NOT_WORKING";
    default:
      return "GOOD";
  }
}

// A flaw line in the notes names wear or damage: "Light pilling under the
// arms", "Small spot on the left cuff". Not one that says it is absent or
// intended: "No stains, holes or pulls", "Faded print is part of the design".
const FLAW =
  /\b(?:spots?|stain\w*|marks?|mark(?:ed|ings)|fad(?:e|ed|ing)|pill\w*|bobbl\w*|holes?|snag\w*|pulls?|pulled|tears?|torn|rips?|ripped|wear|worn|scratch\w*|scuff\w*|crack\w*|chip\w*|missing|discolou?r\w*|yellow(?:ed|ing)|fray\w*|loose|odou?r|smell\w*|dent\w*|tarnish\w*|repair\w*|mended|thinning|shrunk|shrinkage|damage\w*|defects?|flaws?|stretched|lint|uneven|bent|broken|peel\w*|cloudy|dull\w*|patina|residue|blemish\w*|imperfect\w*)\b/i;
const NOT_A_FLAW =
  /^\s*no\b|\bno (?:[\w-]+ ){0,4}(?:spots?|stains?|holes?|pulls?|snags?|tears?|marks?|odou?rs?|flaws?|damage|wear|pilling)\b|\bintact\b|\bpart of the design\b|\bby design\b|\bintended\b|\bin (?:good|great|excellent) shape\b|\bfree of\b|\bwithout\b/i;

/** The flaw lines among the notes' "• " lines. */
export function flawLines(notes: string | undefined): string[] {
  return String(notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("•"))
    .map((l) => l.replace(/^•\s*/, ""))
    .filter((l) => FLAW.test(l) && !NOT_A_FLAW.test(l));
}

const LEAD: Record<string, string> = {
  NEW_WITH_TAGS: "New with tags.",
  NEW_NO_TAGS: "New without tags.",
  EXCELLENT: "Excellent pre-owned condition — looks great.",
  VERY_GOOD: "Very good pre-owned condition — light wear.",
  GOOD: "Good pre-owned condition — lightly worn.",
  FAIR: "Fair pre-owned condition — visible wear.",
  FOR_PARTS_OR_NOT_WORKING: "For parts or not working.",
};

/** The description's short Condition line for a grade, in the seller's words. */
export function conditionLine(grade: string, notes?: string): string {
  const flaw = flawLines(notes)[0];
  const withFlaw = (word: string) =>
    `Condition: Pre-owned, ${word}${flaw ? `, ${flaw.charAt(0).toLowerCase()}${flaw.slice(1).replace(/\.$/, "")}` : ""}.`;
  switch (grade) {
    case "NEW_WITH_TAGS":
      return "Condition: New with tags.";
    case "NEW_NO_TAGS":
      return "Condition: New without tags.";
    case "EXCELLENT":
      return "Condition: Pre-owned, excellent, nothing is wrong with it.";
    case "VERY_GOOD":
      return withFlaw("very good");
    case "FAIR":
      return withFlaw("fair");
    case "FOR_PARTS_OR_NOT_WORKING":
      return "Condition: For parts or not working.";
    default:
      return withFlaw("good");
  }
}

/** The notes with their first line saying the grade; the "• " lines untouched. */
export function notesForGrade(notes: string | undefined, grade: string): string {
  const lead = LEAD[grade] ?? LEAD.GOOD;
  const lines = String(notes ?? "").split("\n");
  const at = lines.findIndex((l) => l.trim() && !l.trim().startsWith("•"));
  if (!String(notes ?? "").trim()) return lead;
  if (at >= 0 && at === lines.findIndex((l) => l.trim())) lines[at] = lead;
  else lines.unshift(lead);
  return lines.join("\n");
}

/** The description with its Condition line saying the grade. */
export function descriptionForGrade(description: string, grade: string, notes?: string): string {
  const lines = String(description ?? "").split("\n");
  const at = lines.findIndex((l) => /^\s*condition\s*:/i.test(l));
  if (at < 0) return description;
  lines[at] = conditionLine(grade, notes);
  return lines.join("\n");
}

/**
 * Everything that changes with the grade: eBay's menu (when the category is
 * prepared), the description's Condition line, the notes' first line.
 */
export function gradeChange(
  l: ListingResult,
  grade: string,
  accepted: string[] = [],
): Partial<ListingResult> {
  const notes = notesForGrade(l.condition_notes, grade);
  return {
    condition: grade,
    ebay_condition: accepted.length ? ebayConditionForGrade(grade, accepted) : "",
    condition_notes: notes,
    description: descriptionForGrade(l.description, grade, notes),
  };
}

/**
 * The model graded below Excellent but named no flaw: the seller's rule says
 * that is Excellent (31 Oct 2026 — a top with nothing wrong came back "Good").
 * Returns whether it changed anything.
 */
export function excellentWithoutFlaw(l: ListingResult): boolean {
  if (!["VERY_GOOD", "GOOD", "FAIR"].includes(String(l.condition))) return false;
  if (flawLines(l.condition_notes).length) return false;
  Object.assign(l, gradeChange(l, "EXCELLENT"));
  delete l.ebay_condition;
  return true;
}
