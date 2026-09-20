import type { ListingResult } from "@/lib/types";

export const EBAY_TITLE_LIMIT = 80;

export function optimizeTitle(listing: ListingResult): string {
  const title = String(listing.title || "").replace(/\s+/g, " ").trim();

  if (title.length > EBAY_TITLE_LIMIT) {
    throw new Error(
      `Generated title exceeds eBay's ${EBAY_TITLE_LIMIT}-character limit.`,
    );
  }

  return title;
}
