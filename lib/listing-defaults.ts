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
  // Personalize: No as well — she never sells a personalized piece (31 Oct
  // 2026). Only where eBay asks the question and offers "No" as an answer.
  // The photo pass cannot supply either: neither is visible, and its check
  // refused the "No" it was asked to give.
  answerNo(listing, meta, /^customi[sz]ed$/i);
  answerNo(listing, meta, /^personali[sz]ed?$/i);
  // Unit Quantity: always 1 — she sells one item per listing (31 Oct 2026).
  // eBay gives no list for it; the photo check refuses a number from a look.
  const unitQuantity = meta.find((a) => /^unit quantity$/i.test(a.name));
  if (unitQuantity && !listing.item_specifics?.[unitQuantity.name]?.trim())
    setDefault(listing, unitQuantity.name, "1");
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

function setDefault(listing: ListingResult, name: string, value: string): void {
  listing.item_specifics = { ...listing.item_specifics, [name]: value };
  if (listing.evidence) {
    listing.evidence = { ...listing.evidence };
    delete listing.evidence[name];
  }
}

function answerNo(listing: ListingResult, meta: AspectMeta[], name: RegExp): void {
  const field = meta.find((a) => name.test(a.name));
  const no = field ? matchAllowed("No", field.values) : null;
  if (field && no && !listing.item_specifics?.[field.name]?.trim())
    setDefault(listing, field.name, no);
}

/**
 * Handmade: No unless the seller's note or a label says the piece is
 * handmade (31 Oct 2026 — one handmade piece in about 400). Applied after the
 * photo pass, so "handmade" on her note still comes through as Yes; only a
 * field still empty then gets No. Returns whether it filled the field.
 */
export function applyDefaultHandmade(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
): boolean {
  const field = meta.find((a) => /^hand\s?made$/i.test(a.name));
  if (!field) return false;
  if (aspects[field.name]?.some((v) => v.trim())) return false;
  const no = matchAllowed("No", field.values);
  if (!no) return false;
  aspects[field.name] = [no];
  return true;
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
