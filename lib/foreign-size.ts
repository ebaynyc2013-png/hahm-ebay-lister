// European, British and Italian women's clothing sizes, converted from
// eBay's own chart — the seller's rules of 31 Oct 2026:
//
//   title        EU 38 M Medium          (EU 38 goes first when 80 is tight)
//   description  Size: EU 38 (US 8, Medium)
//   eBay Size    the letter from eBay's list (M); a US number if the list has
//                no letters; empty if neither — the card then asks
//
// The model writes the size it read with its marker ("EU 38", "UK 10",
// "IT 44"); the program converts, as with shoes, so no size is ever guessed.
// Women's only: eBay's chart has no letters for men, and a men's jacket EU 50
// is not a women's 2XL. Never footwear, never jewellery (a ring's EU 54 is a
// circumference).

import { expectedDepartment } from "./category-selection";
import { isFootwear } from "./title-shoe-size";
import type { ListingResult } from "./types";

// pages.ebay.com/sell/sizechart.html — Women's Clothing Size, read 31 Oct 2026.
// "Exact sizes in this size chart are provided by eBay and may vary by brand."
const CHART: { letter: string; us: string; uk: string; eu: string; it: string }[] = [
  { letter: "XXS", us: "00", uk: "0", eu: "28", it: "34" },
  { letter: "XS", us: "0", uk: "2", eu: "30", it: "36" },
  { letter: "XS", us: "2", uk: "4", eu: "32", it: "38" },
  { letter: "S", us: "4", uk: "6", eu: "34", it: "40" },
  { letter: "S", us: "6", uk: "8", eu: "36", it: "42" },
  { letter: "M", us: "8", uk: "10", eu: "38", it: "44" },
  { letter: "M", us: "10", uk: "12", eu: "40", it: "46" },
  { letter: "L", us: "12", uk: "14", eu: "42", it: "48" },
  { letter: "L", us: "14", uk: "16", eu: "44", it: "50" },
  { letter: "XL", us: "16", uk: "18", eu: "46", it: "52" },
  { letter: "XL", us: "18", uk: "20", eu: "48", it: "54" },
  { letter: "2XL", us: "20", uk: "22", eu: "50", it: "56" },
  { letter: "2XL", us: "22", uk: "24", eu: "52", it: "58" },
];

// The seller writes the letter, then the word: "M Medium", "XL Extra Large".
// XXS and 2XL have no agreed word yet, so they stand alone.
const WORD: Record<string, string> = {
  XS: "Extra Small",
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "Extra Large",
};

const CLOTHING =
  /\b(dress(?:es)?|tops?|shirts?|t-?shirts?|tees?|blouses?|sweaters?|cardigans?|jackets?|coats?|blazers?|skirts?|pants|trousers|jeans|shorts|jumpsuits?|rompers?|vests?|hoodies?|sweatshirts?|tanks?|camis?|camisoles?|tunics?|suits?|bodysuits?|pullovers?|jumpers?|kimonos?|leggings|gowns?|clothing|apparel|tops & blouses)\b/i;
const NOT_CLOTHING = /\b(rings?|jewel(?:le)?ry|necklaces?|bracelets?|earrings?|pendants?|watch(?:es)?)\b/i;

export type SizeSystem = "EU" | "UK" | "IT";

export interface ForeignSize {
  system: SizeSystem;
  value: string;
  us: string;
  letter: string;
  /** "Medium"; the letter itself when there is no agreed word (XXS, 2XL). */
  word: string;
}

const MARKED = /\b(EU|EUR|UK|IT)\s?(\d{1,2})\b|\b(\d{1,2})\s?(EU|EUR|UK|IT)\b/i;

/** A size written with its system — "EU 38", "38 EU", "UK10", "IT 44" — on eBay's chart. */
export function parseForeignSize(raw: unknown): ForeignSize | null {
  const m = String(raw ?? "").match(MARKED);
  if (!m) return null;
  const mark = (m[1] ?? m[4]).toUpperCase();
  const value = String(Number(m[2] ?? m[3]));
  const system: SizeSystem = mark === "EUR" ? "EU" : (mark as SizeSystem);
  const key = system.toLowerCase() as "eu" | "uk" | "it";
  const row = CHART.find((r) => r[key] === value);
  if (!row) return null;
  return {
    system,
    value,
    us: row.us,
    letter: row.letter,
    word: WORD[row.letter] ?? row.letter,
  };
}

/** Is this listing women's clothing (or clothing with no department said)? */
export function isWomensClothing(l: ListingResult): boolean {
  if (isFootwear(l)) return false;
  const what = [l.item_type, l.category_hint, l.category].filter(Boolean).join(" ");
  if (NOT_CLOTHING.test(what) || !CLOTHING.test(what)) return false;
  // The seller's rule for anything not marked otherwise is Women.
  return !/^men\b/i.test(expectedDepartment(l).trim());
}

/** The listing's European, British or Italian women's size, converted — or null. */
export function womensForeignSize(l: ListingResult): ForeignSize | null {
  if (!isWomensClothing(l)) return null;
  return parseForeignSize(l.size) ?? parseForeignSize(l.title);
}

const LETTERS = String.raw`(?:XXS|2XS|XS|S|M|L|XL|XXL|2XL)`;
const WORDS = String.raw`(?:(?:Extra\s+)?(?:Small|Medium|Large))`;

/**
 * "EU 38" in the title becomes "EU 38 M Medium". When that does not fit in
 * `limit`, "EU 38" gives way and "M Medium" stays (the seller, 31 Oct 2026).
 * A title without the marked size is left as it is.
 */
export function foreignSizeInTitle(title: string, l: ListingResult, limit = 80): string {
  const f = womensForeignSize(l);
  if (!f) return title;
  const marked = new RegExp(
    String.raw`\b(?:${f.system}|EUR)\s?${f.value}\b(?:\s+${LETTERS}\b)?(?:\s+${WORDS}\b)?` +
      "|" +
      String.raw`\b${f.value}\s?(?:${f.system}|EUR)\b(?:\s+${LETTERS}\b)?(?:\s+${WORDS}\b)?`,
    "i",
  );
  if (!marked.test(title)) return title;
  const letterWord = f.word === f.letter ? f.letter : `${f.letter} ${f.word}`;
  const tidy = (s: string) => s.replace(/\s{2,}/g, " ").trim();
  const full = tidy(title.replace(marked, `${f.system} ${f.value} ${letterWord}`));
  if (full.length <= limit) return full;
  const short = tidy(title.replace(marked, letterWord));
  return short.length <= limit ? short : title;
}

/** "Size: EU 38 (US 8, Medium)" — in place of whatever Size line was written. */
export function foreignSizeLine(f: ForeignSize): string {
  return `Size: ${f.system} ${f.value} (US ${f.us}, ${f.word})`;
}

export function foreignSizeInDescription(description: string, l: ListingResult): string {
  const f = womensForeignSize(l);
  if (!f) return description;
  const line = foreignSizeLine(f);
  const blocks = String(description ?? "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/);
  const at = blocks.findIndex((b) => /^\s*(?:size|marked size|tagged size)\s*:/i.test(b));
  if (at >= 0) blocks[at] = line;
  else blocks.push(line);
  return blocks.join("\n\n");
}
