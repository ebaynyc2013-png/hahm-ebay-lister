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
  // 2990 is Pre-owned Excellent. 3000 must not be used as a substitute:
  // in these clothing categories it means Pre-owned Good.
  if (!listing.ebay_condition && acceptedIds.has(2990)) {
    listing.ebay_condition = "PRE_OWNED_EXCELLENT";
    listing.condition = "EXCELLENT";
  }
}
