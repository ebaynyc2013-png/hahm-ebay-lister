import type { ListingResult } from "./types";

/**
 * Contact details never go into a listing — the seller's rule of 27 Oct 2026.
 *
 * eBay hid the Colie Bloom painting under its "Offering to buy or sell outside
 * of eBay" policy: the artist's label in one photo read WWW.COLIEBLOOM.COM.
 * Labels, tags, cards and packaging print websites, phones, emails and social
 * handles all the time. The model is told to report them separately and write
 * none of them; this is the guarantee for the text it writes. (Photos cannot
 * be cleaned here — the seller is warned and crops or removes the photo.)
 */

// Website: anything that starts like one, whatever its ending…
// The last character is never a full stop: "…WWW.COLIEBLOOM.COM." ends a sentence.
const PREFIXED_URL = /\b(?:https?:\/\/|www\.)[^\s,;()<>"']*[^\s,;()<>"'.]/gi;
// …or a bare domain with an ending that is plainly a web address. Kept short
// on purpose: "Tiffany & Co.", "J.Crew", "Dr. Martens" and "U.S.A." are words
// in listings, not addresses.
const BARE_DOMAIN =
  /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:com|net|org|shop|store|biz|info)\b(?:\/[^\s,;()<>"']*[^\s,;()<>"'.])?/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// US-style numbers with separators: (555) 123-4567, 555.123.4567, +1 555 123 4567.
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;
// @handle — not an email (no word character right before the @).
const HANDLE = /(?<![\w@.])@[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?/gi;

const PATTERNS = [EMAIL, PREFIXED_URL, BARE_DOMAIN, PHONE, HANDLE];

/** Every contact detail in a piece of text, as written. */
export function findContactInfo(text: string): string[] {
  const found: string[] = [];
  let rest = String(text ?? "");
  for (const p of PATTERNS) {
    p.lastIndex = 0;
    for (const m of rest.matchAll(p)) found.push(m[0].replace(/[.]+$/, ""));
    rest = rest.replace(p, " ");
  }
  return found;
}

/** The text with every contact detail taken out, and the gap tidied. */
export function stripContactInfo(text: string): string {
  return String(text ?? "")
    .split("\n")
    .map((line) => {
      const GAP = "\u0000";
      let out = line;
      for (const p of PATTERNS) {
        p.lastIndex = 0;
        out = out.replace(p, GAP);
      }
      if (out === line) return line;
      return out
        // "call 555-…", "visit www…", "follow us on @…" — the lead-in goes too.
        .replace(
          /\b(?:call|text|e-?mail|visit|follow|contact|find)(?:\s+(?:us|me))?(?:\s+(?:at|on))?\s*\u0000/gi,
          GAP,
        )
        .replace(/\u0000/g, " ")
        .replace(/\(\s*\)/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
        .replace(/[,;:]\s*([.!?])/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]*[,;:]\s*$/, "")
        .trimEnd();
    })
    .join("\n");
}

/**
 * Take contact details out of every field the listing publishes. Returns what
 * was removed, so the seller is told — the photo it came from may still need
 * cropping.
 */
export function scrubContactInfo(listing: ListingResult): string[] {
  const removed: string[] = [];
  const clean = (v: string | undefined) => {
    if (!v) return v;
    const hits = findContactInfo(v);
    if (!hits.length) return v;
    removed.push(...hits);
    return stripContactInfo(v);
  };
  const cleanList = (vs?: string[]) =>
    vs?.map((v) => clean(v) ?? "").filter((v) => v.trim());

  listing.title = clean(listing.title) ?? "";
  listing.description = clean(listing.description) ?? "";
  listing.brand = clean(listing.brand);
  listing.condition_notes = clean(listing.condition_notes);
  listing.key_features = cleanList(listing.key_features);
  listing.search_terms = cleanList(listing.search_terms);
  listing.seo_keywords = cleanList(listing.seo_keywords);
  listing.hashtags = cleanList(listing.hashtags);
  listing.etsy_tags = cleanList(listing.etsy_tags);
  if (listing.item_specifics)
    listing.item_specifics = Object.fromEntries(
      Object.entries(listing.item_specifics)
        .map(([k, v]) => [k, (clean(v) ?? "").trim()] as const)
        .filter(([, v]) => v),
    );
  return [...new Set(removed)];
}
