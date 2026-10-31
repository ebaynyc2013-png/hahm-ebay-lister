import type { ListingResult } from "./types";
import type { AspectMeta } from "./ebay/taxonomy";
import { matchAllowed } from "./ebay/aspects";

// Seller-requested defaults, not facts inferred from the photos. Apply only
// to empty fields while preparing the draft, never during publication.
export function applyListingDefaults(
  listing: ListingResult,
  meta: AspectMeta[],
  acceptedIds: Set<number>,
): void {
  const sizeType = meta.find((a) => a.name === "Size Type");
  if (
    !listing.item_specifics?.["Size Type"]?.trim() &&
    sizeType &&
    (sizeType.mode === "FREE_TEXT" || sizeType.values.includes("Regular"))
  ) {
    listing.item_specifics = {
      ...listing.item_specifics,
      "Size Type": "Regular",
    };
    if (listing.evidence) {
      listing.evidence = { ...listing.evidence };
      delete listing.evidence["Size Type"];
    }
  }
  // Customized: the seller's standing answer is No — she almost never has a
  // customized piece, and changes it by hand when she does (27 Oct 2026).
  // Only where eBay asks the question and offers "No" as an answer. The photo
  // pass cannot supply it: whether a thing was customized is not visible.
  const customized = meta.find((a) => a.name === "Customized");
  const no = customized ? matchAllowed("No", customized.values) : null;
  if (customized && no && !listing.item_specifics?.Customized?.trim()) {
    listing.item_specifics = { ...listing.item_specifics, Customized: no };
    if (listing.evidence) {
      listing.evidence = { ...listing.evidence };
      delete listing.evidence.Customized;
    }
  }
  // The eBay condition follows the grade the AI gave from the photos (the
  // seller's rule, 31 Oct 2026: it judges, starting from Excellent, and the
  // menu, the condition notes and the description always agree). Clothing
  // categories (those offering 2990): 2990 is Pre-owned Excellent, 3000 is
  // Pre-owned Good there, 3010 Pre-owned Fair. A choice already made — the
  // seller's — is never replaced.
  if (!listing.ebay_condition && acceptedIds.has(2990)) {
    const byGrade: Record<string, [number, string]> = {
      EXCELLENT: [2990, "PRE_OWNED_EXCELLENT"],
      VERY_GOOD: [3000, "USED_EXCELLENT"],
      GOOD: [3000, "USED_EXCELLENT"],
      FAIR: [3010, "PRE_OWNED_FAIR"],
      NEW_WITH_TAGS: [1000, "NEW"],
      NEW_NO_TAGS: [1500, "NEW_OTHER"],
    };
    const [id, value] = byGrade[String(listing.condition || "EXCELLENT")] ?? byGrade.EXCELLENT;
    if (acceptedIds.has(id)) listing.ebay_condition = value;
    else if (!listing.condition || listing.condition === "EXCELLENT")
      listing.ebay_condition = "PRE_OWNED_EXCELLENT";
    if (!listing.condition) listing.condition = "EXCELLENT";
  }
}

// Pendant/Locket Type: eBay's list names special kinds of pendant — a letter,
// a coin, a medal, a photo locket — and has no plain "Pendant". For an
// ordinary decorative pendant none of them describes, the seller's answer is
// Charm (28 Oct 2026). Applied after the photo pass, so a kind the photos
// show (Coin, Tassel…) is never overwritten, and only to a piece that has a
// pendant: a plain chain gets nothing.
const SPECIAL_PENDANT =
  /\b(?:lockets?|coins?|medals?|medallions?|bar|tassels?|letters?|initials?|alphabet|dog ?tags?|perfume|amulets?|photo|keepsake|floating)\b/i;

export function applyDefaultPendantType(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
  listing: ListingResult,
): boolean {
  const field = meta.find((a) => /^pendant\s*\/\s*locket type$/i.test(a.name));
  if (!field) return false;
  if (aspects[field.name]?.some((v) => v.trim())) return false;
  const charm = matchAllowed("Charm", field.values);
  if (!charm) return false;
  const said = [
    listing.title,
    listing.item_type,
    ...(aspects.Style ?? []),
    ...(aspects.Type ?? []),
  ].join(" ");
  if (!/\bpendants?\b/i.test(said)) return false;
  if (SPECIAL_PENDANT.test(`${said} ${listing.description ?? ""}`)) return false;
  aspects[field.name] = [charm];
  return true;
}
