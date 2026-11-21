// Ring sizes — the seller's rules of 16 Nov 2026. A European ring size is the
// inside circumference in millimetres, the same scale for every brand; a
// British one is a letter. Buyers on eBay US look for the American number, so:
//
//   title          Size EU 54 US 7            (as marked, then American)
//   description    Size: EU 54 (US 7)         (as marked, then American)
//   Ring Size      the nearest value on eBay's list for the category
//
// The table is Pandora's own (us.pandora.net/en/rings-size-guide/, read 16 Nov
// 2026) — the seller's choice for every brand. A European size between its
// rows comes from the circumference: diameter = EU / π, US = (diameter −
// 11.63 mm) / 0.8128 mm, to the nearest quarter; checked against Pandora's
// rows it agrees to within a quarter size everywhere. A British letter between
// the rows is read off Pandora's letters, in between.
//
// The model writes the size it read with its mark ("EU 54", "UK N"); the
// program converts, so no ring size is ever guessed. An American number is
// left as it is.
//
// Client-safe: no server imports.

import { sizesInTitle } from "./foreign-size";
import type { ListingResult } from "./types";

/** Pandora's chart: European size, American size, British letter(s). */
export const PANDORA_RINGS: { eu: number; us: number; uk: string }[] = [
  { eu: 44, us: 3, uk: "F" },
  { eu: 46, us: 3.75, uk: "H" },
  { eu: 48, us: 4.5, uk: "H1/2 - I1/2" },
  { eu: 49, us: 4.75, uk: "J" },
  { eu: 50, us: 5, uk: "J-K" },
  { eu: 51, us: 5.5, uk: "K-L" },
  { eu: 52, us: 6, uk: "L - L1/2" },
  { eu: 53, us: 6.5, uk: "M" },
  { eu: 54, us: 7, uk: "N" },
  { eu: 55, us: 7.25, uk: "O" },
  { eu: 56, us: 7.5, uk: "O - P" },
  { eu: 57, us: 8, uk: "P" },
  { eu: 58, us: 8.5, uk: "P1/2 - Q1/2" },
  { eu: 59, us: 8.75, uk: "R" },
  { eu: 60, us: 9, uk: "R1/2 - S" },
  { eu: 62, us: 10, uk: "T1/2" },
  { eu: 64, us: 10.5, uk: "V" },
];

// Pandora's British letters as points on one line (A = 0, a half = .5; "J-K"
// is between, 9.5), each with its American size.
const UK_POINTS: [number, number][] = [
  [5, 3],
  [7, 3.75],
  [8, 4.5],
  [9, 4.75],
  [9.5, 5],
  [10.5, 5.5],
  [11.25, 6],
  [12, 6.5],
  [13, 7],
  [14, 7.25],
  [14.5, 7.5],
  [15, 8],
  [16, 8.5],
  [17, 8.75],
  [17.75, 9],
  [19.5, 10],
  [21, 10.5],
];

const quarter = (n: number) => Math.round(n * 4) / 4;

/** "7", "7.25", "7.5". */
export function usText(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** The American size for a European one: Pandora's row, else the circumference. */
export function euToUs(eu: number): number {
  const row = PANDORA_RINGS.find((r) => r.eu === eu);
  if (row) return row.us;
  return quarter((eu / Math.PI - 11.63) / 0.8128);
}

/** The American size for a British letter ("N", "N1/2"), read off Pandora's letters. */
export function ukToUs(letter: string, half = false): number | null {
  const l = letter.trim().toUpperCase();
  if (!/^[A-Z]$/.test(l)) return null;
  const x = l.charCodeAt(0) - 65 + (half ? 0.5 : 0);
  const pts = UK_POINTS;
  let [a, b] = x <= pts[0][0] ? [pts[0], pts[1]] : [pts[pts.length - 2], pts[pts.length - 1]];
  for (let i = 0; i < pts.length - 1; i++)
    if (x >= pts[i][0] && x <= pts[i + 1][0]) {
      [a, b] = [pts[i], pts[i + 1]];
      break;
    }
  const us = a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
  return us > 0 ? quarter(us) : null;
}

export interface RingSize {
  system: "EU" | "UK";
  /** As marked: "54", "N", "N1/2". */
  value: string;
  /** The American size: "7", "7.25". */
  us: string;
}

const HALF = String.raw`(?:\s?(?:1\/2|½))`;

/** A ring size written with its system — "EU 54", "54", "UK N", "UK N½" — converted. */
export function parseRingSize(raw: unknown): RingSize | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const uk = s.match(new RegExp(String.raw`\bUK\s?([A-Z])(${HALF})?(?![A-Za-z])`, "i"));
  if (uk) {
    const half = Boolean(uk[2]);
    const us = ukToUs(uk[1], half);
    return us ? { system: "UK", value: `${uk[1].toUpperCase()}${half ? "1/2" : ""}`, us: usText(us) } : null;
  }
  // A whole number from 40 up is a European circumference ("54", "EU 54",
  // "Pandora 54") — no American or British ring size runs that high.
  for (const m of s.matchAll(/(?<![\d.])(\d{2})(?![\d.])/g)) {
    const n = Number(m[1]);
    if (n >= 40 && n <= 76) return { system: "EU", value: String(n), us: usText(euToUs(n)) };
  }
  return null;
}

const RING = /\brings?\b/i;
const NOT_A_RING = /\b(?:ear\s?rings?|key\s?rings?|keyrings?|ring\s+(?:holder|box|dish|light)|o-?rings?|napkin\s+rings?|split\s+rings?|jump\s+rings?)\b/i;

/** Is this listing a ring to wear? Judged from what the item IS. */
export function isRing(l: Pick<ListingResult, "item_type" | "category_hint" | "category">): boolean {
  const what = [l.item_type, l.category_hint, l.category].filter(Boolean).join(" ");
  return RING.test(what.replace(NOT_A_RING, " "));
}

/** The listing's European or British ring size, converted — or null. */
export function ringSize(l: ListingResult): RingSize | null {
  if (!isRing(l)) return null;
  const specific = Object.entries(l.item_specifics ?? {}).find(([k]) => /^ring size$/i.test(k))?.[1];
  return parseRingSize(l.size) ?? parseRingSize(specific) ?? null;
}

/** "Size: EU 54 (US 7)" — in place of whatever Size line was written. */
export function ringSizeLine(r: RingSize): string {
  return `Size: ${r.system} ${r.value} (US ${r.us})`;
}

export function ringSizeInDescription(description: string, l: ListingResult): string {
  const r = ringSize(l);
  if (!r) return description;
  const blocks = String(description ?? "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/);
  const at = blocks.findIndex((b) => /^\s*(?:size|ring size|marked size|tagged size)\s*:/i.test(b));
  if (at >= 0) blocks[at] = ringSizeLine(r);
  else blocks.push(ringSizeLine(r));
  return blocks.join("\n\n");
}

/**
 * The title says both sizes, the ring's own first (16 Nov 2026): "Size EU 54",
 * "EU 54", "Size 54", "UK N" → "Size EU 54 US 7". Tight for 80: the aesthetic
 * tail goes first, then the word "Size", then whole words around the sizes —
 * both sizes stay (21 Nov 2026: a Pandora ring went out "Size 56" alone).
 */
export function ringSizeInTitle(title: string, l: ListingResult, limit = 80): string {
  const r = ringSize(l);
  if (!r) return title;
  const value = r.system === "UK" ? String.raw`${r.value[0]}(?:${HALF}|1\/2)?` : r.value;
  const marked = new RegExp(
    String.raw`\b(?:Size\s+)?(?:${r.system}|EUR)\s?${value}(?![\w/])(?:\s+US\s+\d{1,2}(?:\.\d+)?\b)?|\bSize\s+${value}(?![\w/])|\b${value}\s?(?:${r.system}|EUR)\b`,
    "i",
  );
  return sizesInTitle(title, l, marked, `Size ${r.system} ${r.value} US ${r.us}`, `Size ${r.us}`, limit, true);
}

// "7", "7.25", "7 1/4", "7½" → 7.25.
function sizeNumber(v: string): number {
  const s = String(v ?? "").replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4").trim();
  const mixed = s.match(/^(\d{1,2})\s+(\d)\/(\d)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const n = Number(s);
  return /^\d{1,2}(?:\.\d+)?$/.test(s) && Number.isFinite(n) ? n : NaN;
}

/**
 * eBay's Ring Size at Prepare: the value on eBay's list nearest the American
 * size; a field with no list takes the American number itself.
 */
export function applyRingSize(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
  l: ListingResult,
): boolean {
  const r = ringSize(l);
  if (!r) return false;
  const field = meta.find((a) => /^ring size$/i.test(a.name.trim()));
  if (!field) return false;
  const us = Number(r.us);
  let chosen = r.us;
  if (field.values.length) {
    const scored = field.values
      .map((v) => ({ v, n: sizeNumber(v) }))
      .filter((x) => Number.isFinite(x.n))
      .sort((a, b) => Math.abs(a.n - us) - Math.abs(b.n - us) || a.n - b.n);
    if (!scored.length) return false;
    chosen = scored[0].v;
  }
  const key = Object.keys(aspects).find((k) => /^ring size$/i.test(k)) ?? field.name;
  if (aspects[key]?.length === 1 && aspects[key][0] === chosen) return false;
  aspects[key] = [chosen];
  return true;
}
