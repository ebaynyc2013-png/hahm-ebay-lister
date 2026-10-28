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

// A karat stamp or a sterling mark — the only things that make "gold" or
// "silver" a material rather than a colour (the seller, 28 Oct 2026: "it is
// gold-plated, not gold").
const KARAT = /\b(?:9|10|14|18|22|24)\s?(?:k|kt|karat|carat)\b|\b(?:375|585|750|916)\b/i;
const STERLING = /\b925\b|\bsterling\b/i;

export interface TagEvidence {
  karat: boolean;
  sterling: boolean;
}

/** Read the listing's own facts for a karat or sterling mark. */
export function tagEvidence(text: string): TagEvidence {
  const t = String(text ?? "");
  return { karat: KARAT.test(t), sterling: STERLING.test(t) };
}

const NO_MARK: TagEvidence = { karat: false, sterling: false };

// One bare word that names a whole department: the listing drowns among
// millions (#boho: 12 million on Depop, 28 Oct 2026). Two- and three-word
// tags are where a buyer actually finds it.
const GENERIC = new Set(
  "necklace necklaces ring rings earrings earring bracelet bracelets jewelry jewellery pendant pendants charm shorts dress dresses top tops shirt skirt pants jeans jacket coat shoes sandals heels boots bag bags purse handbag vintage retro fashion style women womens men mens gift cute aesthetic trendy boho decor home art accessories clothing thrift thrifted".split(
    " ",
  ),
);

// Sizes and measurements never go in a hashtag — "18in", "3inch", "size7".
// Decades ("90s", "1970s") and Y2K are names, not measurements.
const MEASURE = /\d+(?:\.\d+)?(?:in|inch|inches|cm|mm|ft|oz|g|ct)$|\d+(?:in|inch|inches|cm|mm)(?=[a-z])|size\d|\d+x\d+|^\d+$/;

/**
 * Hashtags for Depop, Mercari and Poshmark, in the seller's order (28 Oct
 * 2026): first one or two that say what the item is, then three aesthetics.
 * Lowercase letters and digits only, no repeats, at most 5; no bare generic
 * word, no size or measurement, and "gold"/"silver" only with a mark.
 */
export function cleanHashtags(
  raw: unknown,
  evidence: TagEvidence = NO_MARK,
  isAesthetic: (tag: string) => boolean = () => false,
): string[] {
  const seen: string[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    let word = plain(String(r))
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "");
    if (!evidence.karat) word = word.replace(/(?<!mari)gold(?!tone|plated|filled|en)/g, "goldtone");
    if (!evidence.sterling)
      word = word.replace(/sterling(?:silver)?/g, "silvertone").replace(/silver(?!tone|plated|ware)/g, "silvertone");
    word = word.replace(/(silvertone|goldtone)tone/g, "$1");
    if (word.length < 2 || GENERIC.has(word) || MEASURE.test(word)) continue;
    const tag = `#${word}`;
    if (!seen.includes(tag)) seen.push(tag);
  }
  const item = seen.filter((t) => !isAesthetic(t));
  const style = seen.filter((t) => isAesthetic(t));
  const out = [...item.slice(0, 2), ...style.slice(0, 3)];
  for (const t of [...item.slice(2), ...style.slice(3)]) {
    if (out.length >= HASHTAG_LIMIT) break;
    out.push(t);
  }
  return out.slice(0, HASHTAG_LIMIT);
}

/**
 * Tags Etsy accepts as they are: at most 20 characters; letters, digits,
 * spaces, hyphens, apostrophes and underscores only; no repeats; at most 13.
 * A tag too long is left out rather than cut mid-word into something untrue.
 */
export function cleanEtsyTags(
  raw: unknown,
  evidence: TagEvidence = NO_MARK,
): string[] {
  const out: string[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    let tag = plain(String(r))
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[‘’`´]/g, "'")
      .replace(/[^a-z0-9' _-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s'_-]+|[\s'_-]+$/g, "");
    if (!evidence.karat) tag = tag.replace(/\bgold\b(?!\s*-?\s*(?:tone|plated|filled))/g, "gold tone");
    if (!evidence.sterling)
      tag = tag
        .replace(/\bsterling(?: silver)?\b/g, "silver tone")
        .replace(/\bsilver\b(?!\s*-?\s*(?:tone|plated))/g, "silver tone")
        .replace(/\b(silver|gold) tone tone\b/g, "$1 tone");
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
