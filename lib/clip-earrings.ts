import type { ListingResult } from "./types";

/**
 * Clip-on earrings are never Style "Stud" — a stud goes through a pierced
 * ear, a clip does not (the seller, 16 Nov 2026: "Клипсы — это клипсы").
 * eBay's Style list for earrings (50647) has no Clip-On, so Style keeps only
 * the true form (Dangle/Drop, Hoop…) or stays empty; "Clip-On" goes into the
 * field whose own eBay list offers it (Closure, for example).
 */
const CLIP =
  /\bclip[\s-]?ons?\b|\bclip(?:[\s-]?back)?\s+earrings?\b|\bear[\s-]?clips?\b|\bnon[\s-]?pierced\b|\bclips\b/i;
// An omega back is a post through the ear with a clip behind it: pierced.
const PIERCED_CLIP = /\bomega\b/i;
const EARRING = /\bearrings?\b|\bear[\s-]?clips?\b/i;
const STUD = /\bstuds?\b/i;
const CLIP_ON_VALUE = /^clip[\s-]?on(?:\s+earrings?)?$/i;
const NON_PIERCED_VALUE = /clip|screw|magnet|non[\s-]?pierced/i;

type Listing = Partial<Pick<
  ListingResult,
  "title" | "item_type" | "description" | "seller_notes" | "category_path"
>>;

export function isClipEarring(l: Listing, categoryPath = ""): boolean {
  const kind = `${categoryPath} ${l.category_path ?? ""} ${l.title ?? ""} ${l.item_type ?? ""}`;
  if (!EARRING.test(kind)) return false;
  const said = `${l.title ?? ""}\n${l.item_type ?? ""}\n${l.seller_notes ?? ""}\n${l.description ?? ""}`;
  return CLIP.test(said) && !PIERCED_CLIP.test(said);
}

const isStyle = (name: string) => /^style$/i.test(name.trim());

/** Prepare: no Stud in Style; "Clip-On" wherever eBay's own list offers it. */
export function applyClipEarrings(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[]; cardinality?: string }[],
  listing: Listing,
  categoryPath = "",
): boolean {
  if (!isClipEarring(listing, categoryPath)) return false;
  let changed = false;
  const styleKey = Object.keys(aspects).find(isStyle);
  if (styleKey) {
    const before = (aspects[styleKey] ?? []).map((v) => v.trim()).filter(Boolean);
    const next = before.filter((v) => !STUD.test(v) || CLIP_ON_VALUE.test(v));
    if (next.length !== before.length) {
      if (next.length) aspects[styleKey] = next;
      else delete aspects[styleKey];
      changed = true;
    }
  }
  for (const field of meta) {
    const word = field.values.find((v) => CLIP_ON_VALUE.test(v.trim()));
    if (!word) continue;
    const key = Object.keys(aspects).find((k) => k.trim().toLowerCase() === field.name.trim().toLowerCase()) ?? field.name;
    const current = (aspects[key] ?? []).map((v) => v.trim()).filter(Boolean);
    if (current.some((v) => v.toLowerCase() === word.toLowerCase())) continue;
    if (field.cardinality === "MULTI") aspects[key] = [...current, word];
    else if (!current.length || !current.some((v) => NON_PIERCED_VALUE.test(v))) aspects[key] = [word];
    else continue;
    changed = true;
  }
  return changed;
}

/** The draft's item specifics ("A | B"): Stud taken out of Style for clips. */
export function withoutStudForClips(
  specifics: Record<string, string> | undefined,
  listing: Listing,
): Record<string, string> {
  const out = { ...(specifics ?? {}) };
  if (!isClipEarring(listing)) return out;
  const key = Object.keys(out).find(isStyle);
  if (!key) return out;
  const values = String(out[key] ?? "")
    .split(" | ")
    .map((v) => v.trim())
    .filter((v) => v && (!STUD.test(v) || CLIP_ON_VALUE.test(v)));
  if (values.length) out[key] = values.join(" | ");
  else delete out[key];
  return out;
}
