// The grade, eBay's condition menu, the description's Condition line and the
// opening of the condition notes always agree — the seller's rule of 31 Oct
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

/**
 * The notes split into the grade phrase and its points. Reads both the
 * one-line form of 12 Nov 2026 — "Excellent pre-owned condition: • A • B" —
 * and the older form, a lead line with one "• " line under it per point.
 */
export function noteParts(notes: string | undefined): { lead: string; points: string[] } {
  const text = String(notes ?? "").replace(/\r/g, "").trim();
  if (!text) return { lead: "", points: [] };
  const [head, ...rest] = text.split("•");
  return {
    lead: head.replace(/\s+/g, " ").trim(),
    points: rest.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean),
  };
}

/** The flaw points among the notes' "•" points. */
export function flawLines(notes: string | undefined): string[] {
  return noteParts(notes).points.filter((l) => FLAW.test(l) && !NOT_A_FLAW.test(l));
}

// The grade phrase that opens the notes — just the grade, no "looks great"
// (the seller, 12 Nov 2026). A vintage piece keeps "vintage".
const LEAD: Record<string, string> = {
  NEW_WITH_TAGS: "New with tags",
  NEW_NO_TAGS: "New without tags",
  EXCELLENT: "Excellent pre-owned condition",
  VERY_GOOD: "Very good pre-owned condition",
  GOOD: "Good pre-owned condition",
  FAIR: "Fair pre-owned condition",
  FOR_PARTS_OR_NOT_WORKING: "For parts or not working",
};

/** How many points the notes keep: Excellent and Good up to 3, lower up to 5 (11 Nov 2026). */
export function maxPoints(grade: string | undefined): number {
  return grade === "FAIR" || grade === "FOR_PARTS_OR_NOT_WORKING" ? 5 : 3;
}

function leadFor(grade: string, oldLead = ""): string {
  const lead = LEAD[grade] ?? LEAD.GOOD;
  return /\bvintage\b/i.test(oldLead) ? lead.replace("pre-owned", "vintage") : lead;
}

/** One line: the grade phrase, a colon, then the points — "Excellent pre-owned condition: • A • B". */
export function oneLineNotes(lead: string, points: string[]): string {
  const clean = points.map((p) => p.replace(/[.;,]\s*$/, ""));
  return clean.length ? `${lead}: ${clean.map((p) => `• ${p}`).join(" ")}` : `${lead}.`;
}

/**
 * Too many points: keep every flaw (a grade below Excellent rests on them)
 * and the first others, in the order written.
 */
function keepPoints(points: string[], max: number): string[] {
  if (points.length <= max) return points;
  const isFlaw = (l: string) => FLAW.test(l) && !NOT_A_FLAW.test(l);
  const flaws = points.filter(isFlaw).length;
  let others = Math.max(0, max - flaws);
  return points.filter((l) => isFlaw(l) || others-- > 0);
}

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

/** The notes opening with the grade, in the one-line form; the points kept as written. */
export function notesForGrade(notes: string | undefined, grade: string): string {
  const { lead, points } = noteParts(notes);
  return oneLineNotes(leadFor(grade, lead), points);
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

/**
 * The condition notes as a buyer should read them beside the price: about
 * condition only (1 Nov 2026 — "No care tags present (as noted by seller)"
 * came out on the Prada trousers). Where a fact came from, and lines about
 * care or content labels, are taken out; the Label line in the description
 * already says it.
 */
export function tidyConditionNotes(notes: string | undefined, grade?: string): string {
  if (!notes) return notes ?? "";
  const { lead, points } = noteParts(
    notes.replace(/\s*\((?:as\s+)?(?:noted|stated|mentioned|written|per|according to)\b[^)]*\)/gi, ""),
  );
  const kept = points.filter((p) => !/\b(?:care|content|fabric|fiber|fibre)\s+(?:tags?|labels?)\b/i.test(p));
  // One line, the grade phrase first (the seller, 12 Nov 2026). Without a
  // known grade the model's own phrase stays, minus anything after a dash.
  const opening = grade ? leadFor(grade, lead) : lead.replace(/\s+[—–-]\s+.*$/, "").replace(/[:.]\s*$/, "");
  return oneLineNotes(opening, keepPoints(kept, maxPoints(grade)));
}

/**
 * eBay's condition menu in words a seller reads, for every category
 * (12 Nov 2026: Handcrafted earrings showed "USED EXCELLENT"). eBay sends the
 * condition's number only; this is the name eBay's own site gives it. In
 * clothing (which has Pre-owned Excellent), 3000 is "Pre-owned · Good".
 */
export function conditionMenuLabel(value: string, values: string[]): string {
  const apparel = values.includes("PRE_OWNED_EXCELLENT") || values.includes("PRE_OWNED_FAIR");
  switch (value) {
    case "NEW":
      return apparel ? "New with tags" : "New";
    case "NEW_OTHER":
      return apparel ? "New without tags" : "New other (see details)";
    case "NEW_WITH_DEFECTS":
      return "New with defects";
    case "LIKE_NEW":
      return "Like New";
    case "PRE_OWNED_EXCELLENT":
      return "Pre-owned · Excellent";
    case "USED_EXCELLENT":
      return apparel ? "Pre-owned · Good" : "Pre-owned";
    case "PRE_OWNED_FAIR":
      return "Pre-owned · Fair";
    case "USED_VERY_GOOD":
      return "Used · Very Good";
    case "USED_GOOD":
      return "Used · Good";
    case "USED_ACCEPTABLE":
      return "Used · Acceptable";
    case "FOR_PARTS_OR_NOT_WORKING":
      return "For parts or not working";
    default:
      return value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }
}
