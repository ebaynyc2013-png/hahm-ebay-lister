// Small helpers for eBay item-specifics (aspects), shared between the publish
// pipeline and the model-assisted aspect filler.

import type { AspectMeta } from "./taxonomy";

// eBay rejects any item-specific (aspect) value longer than this (error 25002).
export const MAX_ASPECT_VALUE_LEN = 65;

// Buyer-facing phrases the analysis model sometimes writes for unknown fields.
// These are not attribute values — "Material = See tag in photos" would become
// a searchable eBay filter value. They belong in the description, never in an
// aspect, so every aspect value passes through this check.
// Deliberately narrow: "see"/"check" only count with a photo/tag-ish object so
// real values like the brand "See by Chloé" or pattern "Check Print" survive.
const PLACEHOLDER_VALUE_RE =
  /^((see|check|refer\sto)\s+.*\b(photo|pic|image|tag|label|listing|description|measurement|above|below)|unknown\b|unclear\b|n\/?a\b|none\b|not\s(visible|shown|applicable|available|sure)|no\s(size|tag|label|brand\svisible)|unable\s|can'?t\s|tbd\b|maybe\b|possibly\b|[-?.]+$)/i;

export function isPlaceholderValue(s: string): boolean {
  const t = (s || "").trim();
  return !t || PLACEHOLDER_VALUE_RE.test(t);
}

// Clip an aspect value to eBay's limit, breaking at a word boundary when the
// truncation point lands far enough in to leave a readable phrase.
export function clipAspectValue(s: string, maxLen = MAX_ASPECT_VALUE_LEN): string {
  const t = (s || "").trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

// Clean a single aspect value: placeholder phrases become "", real values get
// clipped to eBay's length limit.
export function cleanAspectValue(s: string, maxLen = MAX_ASPECT_VALUE_LEN): string {
  return isPlaceholderValue(s) ? "" : clipAspectValue(s, maxLen);
}

// Split a model-provided value into its parts ("Cotton / Polyester" →
// ["Cotton", "Polyester"]), cleaning each. Multi-value aspects keep every
// part; single-value aspects take the first (see enforceCardinality).
//
// A split only happens when EVERY resulting part is a real word (3+ chars):
// "Black & White" and "Cotton/Polyester" split, while names and sizes whose
// pieces are fragments — "AC/DC", "H&M", "Texas A&M", "9 1/2", "S/M" — stay
// whole instead of being shredded.
const VALUE_SEPARATOR_RE = /\s*(?:\/|,|\||&|\band\b)\s*/i;
const MIN_SPLIT_PART_LEN = 3;

export function splitAspectValues(v: unknown, maxLen = MAX_ASPECT_VALUE_LEN): string[] {
  const flat: string[] = [];
  const push = (raw: unknown) => {
    const s = String(raw ?? "").trim();
    if (!s) return;
    let parts = s.split(VALUE_SEPARATOR_RE).map((p) => p.trim());
    if (parts.length < 2 || parts.some((p) => p.length < MIN_SPLIT_PART_LEN)) {
      parts = [s];
    }
    for (const part of parts) {
      const cleaned = cleanAspectValue(part.replace(/\s+/g, " "), maxLen);
      if (cleaned && !flat.some((x) => x.toLowerCase() === cleaned.toLowerCase())) {
        flat.push(cleaned);
      }
    }
  };
  if (Array.isArray(v)) v.forEach(push);
  else push(v);
  return flat;
}

// Cap how many values a MULTI aspect carries. eBay itself allows thirty, so
// this number is ours, not its: it exists to stop a rambling model response
// turning one aspect into a paragraph, not to ration honest facts. Five was
// cutting real ones short — a shirt dress is plausibly four or five Styles,
// and a garment can carry six or seven true Features (Pockets, Collared,
// Lined, Belt Loops, Stretch, Lightweight) without a word of padding.
//
// Deliberately far below eBay's thirty. Its search manipulation policy is
// blunt — "Using keywords that are not directly related to the item for sale
// is not allowed", on pain of the listing being removed — so room to fill a
// field honestly is the goal, and room to stuff one is not.
export const MAX_MULTI_VALUES = 8;

// Make every aspect's value count legal for eBay. MULTI aspects keep up to
// MAX_MULTI_VALUES entries; SINGLE aspects (and aspects eBay doesn't know,
// where MULTI can't be proven safe) collapse to their first value. Features
// is the long-standing exception: eBay accepts several everywhere it exists,
// and the app always sent it as a list.
export function enforceCardinality(
  aspects: Record<string, string[]>,
  meta: AspectMeta[]
): void {
  const byName = new Map(meta.map((a) => [a.name.toLowerCase(), a]));
  for (const key of Object.keys(aspects)) {
    const a = byName.get(key.toLowerCase());
    const vals = aspects[key] || [];
    if (vals.length <= 1) continue;
    const multi = a ? a.cardinality === "MULTI" : key === "Features";
    aspects[key] = multi ? vals.slice(0, MAX_MULTI_VALUES) : vals.slice(0, 1);
  }
}

// eBay hard-validates NUMBER-typed aspects at publish time ("Fabric weight
// must be greater than 0. Enter up to 1 number after the decimal.") — a prose
// value like "Heavyweight" fails the whole listing with 25002. Keep only a
// positive numeric token pulled from each value ("6.1 oz" → "6.1", int32
// aspects rounded to whole numbers) and drop the aspect entirely when none of
// its values contain one. Returns the names of dropped aspects for logging.
export function sanitizeNumericAspects(
  aspects: Record<string, string[]>,
  meta: AspectMeta[]
): string[] {
  const dropped: string[] = [];
  const byName = new Map(meta.map((a) => [a.name.toLowerCase(), a]));
  for (const key of Object.keys(aspects)) {
    const a = byName.get(key.toLowerCase());
    if (!a || a.dataType !== "NUMBER") continue;
    const kept: string[] = [];
    for (const v of aspects[key] || []) {
      const m = String(v).match(/-?\d+(?:\.\d+)?/);
      if (!m) continue;
      const num = a.format === "int32" ? String(Math.round(Number(m[0]))) : m[0];
      if (Number(num) > 0 && !kept.includes(num)) kept.push(num);
    }
    if (kept.length) {
      aspects[key] = kept;
    } else {
      delete aspects[key];
      dropped.push(key);
    }
  }
  return dropped;
}

// Match a value against eBay's allowed list, case-insensitively and tolerating
// singular/plural (so "Unisex Adult" resolves to the valid "Unisex Adults").
// Returns the canonical allowed value, or null if there's no match.
// Fields that are read off a label, never judged from an item. eBay offers
// 4,523 brands and 132 sizes for a dress; those lists are vocabularies to
// validate against, not menus to pick from, and a value here is kept exactly
// as it was read.
export const READ_NOT_JUDGED = new Set([
  "brand",
  "size",
  "model",
  "mpn",
  "upc",
  "ean",
  "isbn",
  "manufacturer",
  "manufacturer part number",
  "style code",
  "serial number",
]);

// eBay's values for a measurement are numbers — "16 in", "18 in" for a
// necklace, "6.5", "7" for a shoe, "1.2 mm" for a stone. A list of those is a
// scale, not a set of choices, and a reading off a tape measure that eBay
// happens not to list ("17.5 in") is still the right answer.
export function mostlyNumeric(values: string[]): boolean {
  const numeric = values.filter((v) => /^\s*[\d.]/.test(v)).length;
  return numeric * 2 > values.length;
}

/**
 * Whether eBay published a closed set of answers for this aspect — the exact
 * words buyers filter on. Where it did, a value outside the set is worthless
 * even when it is true: "Puff Sleeve Button Front" describes a dress
 * perfectly and matches no Style filter on eBay, whose Style list for dresses
 * is Casual, Bohemian, Chic, Prairie — mood and era, not cut.
 *
 * Two kinds of list are not choice sets. Identifiers and sizes are read off a
 * label, and eBay's catalogue is not the limit of what exists — a brand it has
 * never heard of is still the brand on the tag. Measurements are a scale
 * rather than a vocabulary.
 */
export function isChoiceSet(a: { name: string; values: string[] }): boolean {
  if (!a.values.length) return false;
  if (READ_NOT_JUDGED.has(a.name.toLowerCase())) return false;
  return !mostlyNumeric(a.values);
}

/**
 * eBay's own word for a value, or null when eBay has no word for it.
 *
 * Tries the value as written, then lets `snapToVocabulary` reduce a shade or a
 * qualified phrase ("Light Blue" → "Blue"), and insists the result is really
 * in the list — snapping returns the input unchanged when it cannot place it.
 */
export function toAllowedValue(
  value: string,
  allowed: string[],
  synonyms?: Record<string, string>,
): string | null {
  return (
    matchAllowed(value, allowed) ??
    matchAllowed(snapToVocabulary(value, allowed, synonyms), allowed)
  );
}

/** eBay spells colour "Color"; its shade synonyms apply only to those fields. */
export function isColorAspect(name: string): boolean {
  return /\bcolou?r\b/i.test(name);
}

function words(value: string): string {
  return (
    " " +
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim() +
    " "
  );
}

/**
 * eBay offers a vocabulary for many free-text fields too — seventeen colours
 * for a dress, six dress lengths. A value outside it is accepted and then
 * ignored by the filters buyers actually use: a dress recorded as "Light Blue"
 * never appears under Color: Blue, which is the only blue eBay offers, and the
 * listing quietly drops out of that search.
 *
 * Nothing is lost by snapping to eBay's word, because the shade still stands in
 * the title and description where people read it. Nothing is dropped either:
 * where no offered value fits, or more than one does, the value stands exactly
 * as written — free text means free text.
 */
export function snapToVocabulary(
  value: string,
  allowed: string[],
  synonyms?: Record<string, string>,
): string {
  if (!allowed.length || !value.trim()) return value;
  const exact = matchAllowed(value, allowed);
  if (exact) return exact;
  const haystack = words(value);
  const hits = allowed.filter((v) => {
    const needle = words(v);
    return needle.trim().length > 0 && haystack.includes(needle);
  });
  if (hits.length === 1) return hits[0];
  if (hits.length || !synonyms) return value;
  // Nothing of eBay's vocabulary appears in the words themselves. A shade may
  // still have one obvious home: "Navy Blue" resolves above because it carries
  // the word Blue, but a bare "Navy" does not, and resellers write bare shades
  // constantly.
  const named = new Set(
    haystack
      .trim()
      .split(" ")
      .map((w) => synonyms[w])
      .filter(Boolean),
  );
  if (named.size !== 1) return value;
  const only = [...named][0];
  return allowed.some((v) => v.toLowerCase() === only.toLowerCase())
    ? only
    : value;
}

/**
 * Shades a reseller writes that eBay's colour list has no entry for, where the
 * shade has one obvious home: a buyer filtering Red expects burgundy among the
 * results, and one filtering Blue expects navy.
 *
 * Nine shades that sit between two of eBay's colours were held back until the
 * seller, who knows how her buyers search, decided where each belongs. She
 * did: turquoise, teal and aqua are Blue; coral and fuchsia are Pink; rust is
 * Orange; mustard is Yellow; taupe is Beige; plum is Purple. Magenta was not
 * among them and stays as written.
 */
export const COLOR_SYNONYMS: Record<string, string> = {
  // The seller's own decisions on the in-between shades.
  turquoise: "Blue",
  teal: "Blue",
  aqua: "Blue",
  coral: "Pink",
  fuchsia: "Pink",
  rust: "Orange",
  mustard: "Yellow",
  taupe: "Beige",
  plum: "Purple",
  navy: "Blue",
  cobalt: "Blue",
  indigo: "Blue",
  periwinkle: "Blue",
  emerald: "Green",
  olive: "Green",
  forest: "Green",
  sage: "Green",
  mint: "Green",
  lime: "Green",
  hunter: "Green",
  burgundy: "Red",
  maroon: "Red",
  wine: "Red",
  crimson: "Red",
  scarlet: "Red",
  cherry: "Red",
  charcoal: "Gray",
  slate: "Gray",
  grey: "Gray",
  heather: "Gray",
  cream: "Ivory",
  eggshell: "Ivory",
  bone: "Ivory",
  ecru: "Ivory",
  tan: "Beige",
  khaki: "Beige",
  camel: "Beige",
  nude: "Beige",
  sand: "Beige",
  lavender: "Purple",
  lilac: "Purple",
  violet: "Purple",
  mauve: "Purple",
  blush: "Pink",
  rose: "Pink",
  bronze: "Gold",
  brass: "Gold",
  champagne: "Gold",
  chocolate: "Brown",
  espresso: "Brown",
  cognac: "Brown",
  chestnut: "Brown",
};

export function matchAllowed(value: string, allowed: string[]): string | null {
  const ls = (value || "").trim().toLowerCase();
  if (!ls) return null;
  for (const v of allowed) {
    const lv = v.toLowerCase();
    if (lv === ls || lv === `${ls}s` || `${lv}s` === ls) return v;
  }
  return null;
}

// Rename model-provided aspect keys to eBay's exact (canonical) aspect names,
// matching case-insensitively. The analysis model says "Country/region of
// manufacture" or "SLEEVE LENGTH"; eBay only counts the specific if the key
// matches its localized aspect name exactly — otherwise it stays "suggested"
// on the live listing.
export function canonicalizeAspectKeys(
  aspects: Record<string, string[]>,
  meta: AspectMeta[]
): void {
  const canonical = new Map<string, string>();
  for (const a of meta) {
    if (a.name) canonical.set(a.name.toLowerCase(), a.name);
  }
  for (const key of Object.keys(aspects)) {
    const proper = canonical.get(key.toLowerCase());
    if (proper && proper !== key) {
      if (!aspects[proper]) aspects[proper] = aspects[key];
      delete aspects[key];
    }
  }
  // Snap SELECTION_ONLY values to eBay's canonical spelling where we can.
  for (const a of meta) {
    if (a.mode !== "SELECTION_ONLY" || !aspects[a.name]?.length) continue;
    const vals = aspects[a.name];
    const matched: string[] = [];
    for (const v of vals) {
      const m = matchAllowed(v, a.values);
      if (m && !matched.includes(m)) matched.push(m);
    }
    if (matched.length) {
      aspects[a.name] = matched;
      continue;
    }
    // The value may be a compound allowed value that value-splitting broke
    // apart ("Hook & Eye" → Hook, Eye) — try rejoining before giving up.
    if (vals.length > 1) {
      for (const sep of [" & ", " / ", ", ", " and "]) {
        const joined = matchAllowed(vals.join(sep), a.values);
        if (joined) {
          aspects[a.name] = [joined];
          break;
        }
      }
    }
  }
}

// eBay sometimes names an aspect more narrowly than the photo analysis does.
// A shoe category asks for "Upper Material" and leaves plain "Material"
// optional, so a sandal whose material was established as Satin still shows an
// empty REQUIRED field. The substance is already known — only the label eBay
// files it under differs — so carry it across.
//
// Only an unambiguous source is carried: a shoe recorded as "Leather | Rubber"
// says nothing about which of the two the upper is, and a guess there is the
// kind the photo rules exist to prevent.
// eBay files the purity separately, in "Metal Purity", so a Metal of
// "Sterling Silver 925" says 925 twice and matches none of eBay's metal
// values. Drop the hallmark number and the karat marking from the metal name.
function withoutPurity(value: string): string {
  const stripped = value
    .replace(/\b(?:\d{3}|\d{1,2}\s?kt?|\d{1,2}\s?carat)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // "925" on its own is a purity, not a metal — nothing survives, so nothing
  // is carried across.
  return stripped;
}

const ASPECT_ALIASES: {
  source: string;
  target: string;
  transform?: (value: string) => string;
}[] = [
  { source: "Material", target: "Upper Material" },
  // Jewellery categories ask for "Metal" and make it REQUIRED, while leaving
  // plain "Material" optional — so a pair of earrings whose material was read
  // off the hallmark as "Sterling Silver 925" still shows an empty required
  // field right beside a Metal Purity of 925.
  { source: "Material", target: "Metal", transform: withoutPurity },
];

export function applyAspectAliases(
  aspects: Record<string, string[]>,
  meta: AspectMeta[],
): void {
  for (const { source, target, transform } of ASPECT_ALIASES) {
    const values = aspects[source];
    if (values?.length !== 1) continue;
    const aspect = meta.find((a) => a.name === target);
    if (!aspect || aspects[target]?.length) continue;
    const value = (transform ? transform(values[0]) : values[0]).trim();
    if (!value) continue;
    const accepted =
      aspect.mode === "SELECTION_ONLY"
        ? matchAllowed(value, aspect.values)
        : value;
    if (accepted) aspects[target] = [accepted];
  }
}
