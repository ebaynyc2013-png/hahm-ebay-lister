// European sizes eBay has no women's-chart row for — men's tailoring, men's
// dress shirts, children's clothing, kids' and baby shoes — turned into the
// American size in the description (the seller's rules of 16 Nov 2026:
// "first the size it was made in, then the American one, never a guess"):
//
//   men's jacket, suit, coat   Size: EU 50 (US 40)        EU = US + 10
//   men's trousers             Size: EU 50 (US 34)        EU = US waist + 16
//   men's dress shirt          Size: EU 39 (US 15.5)      collar, eBay's chart
//   children's clothing        Size: EU 104 (US 4T, fits up to 104 cm / 41")
//   kids' and baby shoes       Size: EU 17 (US 1.5-2)     eBay's chart
//
// Sources, read 16 Nov 2026: men's tailoring — Lord & Taylor's chart
// (lordandtaylor.com/pages/mens-tailoring-size-chart: US 34–46 = EU 44–56,
// the waist 6 below the jacket), the tailors' "add 10"; dress shirts and
// shoes — eBay's own chart (pages.ebay.com/sell/sizechart.html); children —
// a European size is the child's height in cm, matched to Carter's height
// table (oshkosh.com.au/contents/26-carters-oshkosh-clothing-size-guide),
// with the height itself written beside it, the one exact fact.
//
// Only a size written with its mark ("EU 50", "IT 50") is converted for men —
// a bare 44 on a jacket could be either system. A child's European size is a
// height, from 50 up, so a bare one is plain. An American size is left alone.
//
// Client-safe: no server imports.

import { expectedDepartment } from "./category-selection";
import { findShoeSizeRow } from "./shoe-sizes";
import { isFootwear, shoeDepartment } from "./title-shoe-size";
import { sizesInTitle, type ForeignSize } from "./foreign-size";
import type { ListingResult } from "./types";

export interface OtherSize {
  kind: "jacket" | "trousers" | "shirt" | "kids" | "kids-shoes";
  /** As marked: "50", "98/104". */
  value: string;
  /** The American size: "40", "4T", "1.5-2". */
  us: string;
  /** The description's Size line. */
  line: string;
}

const what = (l: ListingResult) => [l.item_type, l.category_hint, l.category].filter(Boolean).join(" ");

const JACKET = /\b(?:suits?|blazers?|sport\s?coats?|sportcoats?|jackets?|coats?|overcoats?|tuxedos?|tuxedo jackets?)\b/i;
const TROUSERS = /\b(?:trousers|pants|slacks|chinos)\b/i;
const SHIRT = /\b(?:dress\s+shirts?|shirts?)\b/i;
const CLOTHING =
  /\b(dress(?:es)?|tops?|shirts?|t-?shirts?|tees?|blouses?|sweaters?|cardigans?|jackets?|coats?|skirts?|pants|trousers|jeans|shorts|jumpsuits?|rompers?|vests?|hoodies?|sweatshirts?|leggings|bodysuits?|onesies?|sleepers?|pajamas?|pyjamas?|overalls?|outfits?|sets?|clothing|apparel|snowsuits?)\b/i;

function isMenswear(l: ListingResult): boolean {
  const d = (expectedDepartment(l) || l.item_specifics?.Department || "").trim();
  if (/^men\b/i.test(d)) return true;
  return /(?:^|>\s*)Men(?:'s)?\b/.test(l.category_path ?? "") && !/Women/i.test(l.category_path ?? "");
}

function isChildren(l: ListingResult): boolean {
  const said = [expectedDepartment(l), l.item_specifics?.Department, l.category_path].filter(Boolean).join(" ");
  return /\b(?:boys?|girls?|kids?|baby|babies|toddlers?|infants?|unisex kids|children'?s?|youth)\b/i.test(said);
}

// eBay's men's dress shirt chart, collar: EU cm → US inches.
const COLLAR: Record<number, string> = {
  37: "14.5", 38: "15", 39: "15.5", 41: "16", 42: "16.5", 43: "17", 44: "17.5", 46: "18",
  47: "18.5", 48: "19", 50: "19.5", 51: "20", 52: "20.5", 53: "21", 55: "21.5", 56: "22",
};

// Children: the tallest a European size fits (cm) → Carter's US size whose
// height range holds it.
const KIDS: [number, string][] = [
  [50, "NB"], [56, "3M"], [62, "6M"], [68, "6M"], [74, "12M"], [80, "18M"], [86, "24M"],
  [92, "2T"], [98, "3T"], [104, "4T"], [110, "5"], [116, "6"], [122, "7"], [128, "7"],
  [134, "8"], [140, "10"], [146, "12"], [152, "12"], [158, "14"], [164, "16"],
];

const MARKED = /\b(?:EU|EUR|IT|DE|FR)\s?(\d{2})\b|\b(\d{2})\s?(?:EU|EUR|IT)\b/i;

/** Inches to the nearest quarter, as the seller writes them: 41", 36.25". */
function inches(cm: number): string {
  return `${Number((Math.round((cm / 2.54) * 4) / 4).toFixed(2))}"`;
}

function menSize(l: ListingResult): OtherSize | null {
  if (!isMenswear(l) || isFootwear(l)) return null;
  const raw = String(l.size ?? "");
  const thing = what(l);
  const m = raw.match(MARKED);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  if (TROUSERS.test(thing) && !JACKET.test(thing)) {
    if (n >= 40 && n <= 66) return { kind: "trousers", value: String(n), us: String(n - 16), line: `Size: EU ${n} (US ${n - 16})` };
    return null;
  }
  if (JACKET.test(thing)) {
    if (n >= 40 && n <= 66) return { kind: "jacket", value: String(n), us: String(n - 10), line: `Size: EU ${n} (US ${n - 10})` };
    return null;
  }
  if (SHIRT.test(thing)) {
    // A collar: marked, in cm, "39/40", or 37–43 (no European clothing size
    // is that small for men).
    const collar = raw.match(/\b(3[7-9]|4\d|5[0-6])(?:\s?cm\b|\s?\/\s?\d{2}\b)?/);
    const c = collar ? Number(collar[1]) : NaN;
    const plainCollar = /cm|collar|\//i.test(raw) || (c >= 37 && c <= 43) || Number.isFinite(n);
    if (!Number.isFinite(c) || !plainCollar) return null;
    const us = COLLAR[c] ?? String(Math.round((c / 2.54) * 2) / 2);
    return { kind: "shirt", value: String(c), us, line: `Size: EU ${c} (US ${us})` };
  }
  return null;
}

function kidsClothingSize(l: ListingResult): OtherSize | null {
  if (!isChildren(l) || isFootwear(l) || !CLOTHING.test(what(l))) return null;
  const raw = String(l.size ?? "");
  // "104", "EU 104", "104 cm", "98/104" — the tallest it fits is the last.
  const m = raw.match(/\b(\d{2,3})(?:\s?\/\s?(\d{2,3}))?\b/);
  if (!m) return null;
  const tall = Number(m[2] ?? m[1]);
  if (!(tall >= 50 && tall <= 176)) return null;
  const row = KIDS.find(([cm]) => cm >= tall);
  if (!row) return null;
  const value = m[2] ? `${m[1]}/${m[2]}` : m[1];
  return {
    kind: "kids",
    value,
    us: row[1],
    line: `Size: EU ${value} (US ${row[1]}, fits up to ${tall} cm / ${inches(tall)})`,
  };
}

function kidsShoeSize(l: ListingResult): OtherSize | null {
  if (!isFootwear(l)) return null;
  const dept = shoeDepartment(l);
  if (dept !== "Kids" && dept !== "Baby") return null;
  const raw = String(l.size ?? "");
  const m = raw.match(/\b(?:EU|EUR)\s?(\d{2}(?:\.5)?)\b|\b(\d{2}(?:\.5)?)\s?EU\b/i) ?? raw.match(/^\s*(\d{2}(?:\.5)?)\s*$/);
  const v = m ? (m[1] ?? m[2]) : "";
  const n = Number(v);
  if (!v || !(dept === "Baby" ? n >= 15 : n >= 26)) return null;
  const row = findShoeSizeRow(v, dept, "eu");
  if (!row) return null;
  return { kind: "kids-shoes", value: v, us: row.us, line: `Size: EU ${v} (US ${row.us})` };
}

/** The listing's European size for men, children or kids' shoes, converted — or null. */
export function otherForeignSize(l: ListingResult): OtherSize | null {
  return kidsShoeSize(l) ?? menSize(l) ?? kidsClothingSize(l);
}

/** The description's Size line says both sizes; nothing else changes. */
export function otherSizeInDescription(description: string, l: ListingResult): string {
  const s = otherForeignSize(l);
  if (!s) return description;
  const blocks = String(description ?? "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/);
  const at = blocks.findIndex((b) => /^\s*(?:size|marked size|tagged size|shoe size)\s*:/i.test(b));
  if (at >= 0) blocks[at] = s.line;
  else blocks.push(s.line);
  return blocks.join("\n\n");
}

/**
 * The title says both sizes, the label's first (the seller, 16 Nov 2026 —
 * "we sell in America"): "EU 50 US 40", "EU 104 US 4T", a baby shoe "EU 17
 * US 1.5-2". Kids' shoes are left to the shoe rule ("Size 10.5 EU 28", like adults').
 * Tight for 80: the aesthetic tail goes first, then whole words around the
 * sizes — both stay (the seller, 21 Nov 2026).
 */
export function otherSizeInTitle(title: string, l: ListingResult, limit = 80): string {
  const s = otherForeignSize(l);
  if (!s) return title;
  if (s.kind === "kids-shoes" && shoeDepartment(l) !== "Baby") return title;
  const v = s.value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const usAfter = String.raw`(?:\s+US\s+[\w.\-]+)?`;
  const marked = new RegExp(
    String.raw`\b(?:Size\s+)?(?:EU|EUR|IT|DE|FR)\s?${v}(?![\w/])${usAfter}|\b${v}\s?(?:EU|EUR|IT)\b` +
      (s.kind === "kids" ? String.raw`|\bSize\s+${v}(?![\w/])` : ""),
    "i",
  );
  return sizesInTitle(title, l, marked, `EU ${s.value} US ${s.us}`, `US ${s.us}`, limit, true);
}

/** For eBay's Size field at Prepare: the American size, chosen from eBay's list. */
export function otherSizeForList(l: ListingResult): ForeignSize | null {
  const s = otherForeignSize(l);
  if (!s || s.kind === "kids-shoes") return null;
  return { system: "EU", value: s.value, us: s.us, letter: "", word: "" };
}
