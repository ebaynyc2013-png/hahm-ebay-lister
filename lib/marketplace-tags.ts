/**
 * Tags for the seller's other shops — shown on the card for copying, never
 * sent to eBay (her rule of 27 Oct 2026; to be worked through again later).
 *
 * Depop and Mercari read hashtags: one line serves both, most important
 * first — Mercari takes three, Depop about five. Etsy has its own field of
 * 13 tags, and refuses a pasted set when any one of them breaks its rules:
 * longer than 20 characters, a character other than a letter, digit, space,
 * hyphen, apostrophe or underscore, or the same tag twice. The model is told
 * those rules; this makes sure every tag on the card would be accepted.
 */

export const HASHTAG_LIMIT = 5;
export const MERCARI_HASHTAGS = 3;
export const ETSY_TAG_LIMIT = 13;
export const ETSY_TAG_MAX_CHARS = 20;

// "Châtelaine" → "Chatelaine": letters an Etsy tag certainly accepts.
const plain = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** "#goldnecklace" — lowercase letters and digits only, no repeats, at most 5. */
export function cleanHashtags(raw: unknown): string[] {
  const out: string[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const word = plain(String(r))
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "");
    if (word.length < 2 || /^\d+$/.test(word)) continue;
    const tag = `#${word}`;
    if (!out.includes(tag)) out.push(tag);
    if (out.length === HASHTAG_LIMIT) break;
  }
  return out;
}

/**
 * Tags Etsy accepts as they are: at most 20 characters; letters, digits,
 * spaces, hyphens, apostrophes and underscores only; no repeats; at most 13.
 * A tag too long is left out rather than cut mid-word into something untrue.
 */
export function cleanEtsyTags(raw: unknown): string[] {
  const out: string[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const tag = plain(String(r))
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[‘’`´]/g, "'")
      .replace(/[^a-z0-9' _-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s'_-]+|[\s'_-]+$/g, "");
    if (!tag || tag.length > ETSY_TAG_MAX_CHARS) continue;
    if (out.includes(tag)) continue;
    out.push(tag);
    if (out.length === ETSY_TAG_LIMIT) break;
  }
  return out;
}

/** What the copy buttons put on the clipboard. */
export const hashtagLine = (tags: string[]) => tags.join(" ");
export const etsyTagLine = (tags: string[]) => tags.join(", ");
