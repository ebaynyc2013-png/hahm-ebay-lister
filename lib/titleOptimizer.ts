import type { ListingResult } from "@/lib/types";
import { NOT_IN_TITLE } from "@/lib/aesthetics";
import { shoeSizesInTitle } from "@/lib/title-shoe-size";

export const EBAY_TITLE_LIMIT = 80;

const Q = "['’]"; // straight or curly apostrophe

/**
 * The seller's never-in-the-title list, applied after the model writes.
 *
 * The prompt already tells the model all of this; this is the guarantee. It
 * only ever REMOVES these exact words — it never reorders or rewrites, because
 * every other word in a title is the seller's to keep. (The only addition the
 * optimizer makes is a shoe's second size, from eBay's chart.)
 *
 *   - gender words: she never spends title space on them
 *   - condition wording, except "Damaged", "For Parts" and "New With Tags",
 *     which she wants at the end
 *   - Barbie (a trademark) and Gypsy (a slur): listings carrying either are
 *     taken down. Both remain fine as item specifics.
 */
const NEVER_IN_TITLE: RegExp[] = [
  new RegExp(`\\bwomen${Q}?s\\b`, "gi"),
  new RegExp(`\\bwoman${Q}?s?\\b`, "gi"),
  new RegExp(`\\bladies${Q}?(?=\\s|$)`, "gi"),
  // Men's too: the seller writes no gender in a title, women's or men's.
  new RegExp(`\\bmen${Q}?s\\b`, "gi"),
  /\b(?:excellent|great|good|very good|gently used|like new|mint)\s+condition\b/gi,
  /\b(?:euc|guc|vguc)\b/gi,
  /\bpre[\s-]?owned\b/gi,
  ...NOT_IN_TITLE.map((w) => new RegExp(`\\b${w}\\b`, "gi")),
];

/**
 * Remove the never-in-title words, except where one is part of the brand
 * itself — "Woman Within" is a label, and breaking a brand apart is the one
 * thing a title must never do.
 */
export function stripNeverInTitle(title: string, brand = ""): string {
  let out = title;
  for (const pattern of NEVER_IN_TITLE) {
    pattern.lastIndex = 0;
    if (brand && pattern.test(brand)) continue;
    pattern.lastIndex = 0;
    out = out.replace(pattern, " ");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

export function optimizeTitle(listing: ListingResult): string {
  const normalized = String(listing.title || "").replace(/\s+/g, " ").trim();
  const stripped = stripNeverInTitle(normalized, listing.brand) || normalized;
  // The one thing this adds: a shoe's second size, read off eBay's chart.
  const title = shoeSizesInTitle(stripped, listing, EBAY_TITLE_LIMIT);

  if (title.length > EBAY_TITLE_LIMIT) {
    throw new Error(
      `Generated title exceeds eBay's ${EBAY_TITLE_LIMIT}-character limit.`,
    );
  }

  return title;
}
