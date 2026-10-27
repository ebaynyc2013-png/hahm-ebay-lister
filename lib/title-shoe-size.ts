// Shoe titles carry both the US and the EU size — "6.5 37", "7M 37.5", with no
// "EU" between them — and the conversion is done here, from eBay's own chart,
// not by the model.
//
// An insole usually shows one system. Left to the model, EU 37 became whatever
// US size it remembered; the women's and men's charts even disagree with each
// other (EU 37 is women's US 6.5 but men's US 4.5). So the model writes the
// size it read, and this fills in the other one exactly.

import { expectedDepartment } from "./category-selection";
import { findShoeSizeRow, type ShoeDepartment } from "./shoe-sizes";
import type { ListingResult } from "./types";

const FOOTWEAR =
  /\b(shoes?|heels?|pumps?|sandals?|boots?|booties|sneakers?|trainers?|loafers?|flats?|mules?|slingbacks?|oxfords?|clogs?|wedges?|espadrilles?|slippers?|moccasins?|stilettos?)\b/i;

/** Is this listing a pair of shoes? Judged from what the item IS, not the title. */
export function isFootwear(l: ListingResult): boolean {
  const what = [l.item_type, l.category_hint, l.category]
    .filter(Boolean)
    .join(" ")
    // "Boot cut" jeans are not boots.
    .replace(/\bboot[\s-]?cut\b/gi, " ");
  return FOOTWEAR.test(what);
}

/**
 * Which chart to read. Men only when the listing says men's — the seller's
 * rule for anything not marked otherwise is Women.
 */
export function shoeDepartment(l: ListingResult): ShoeDepartment {
  const d = expectedDepartment(l) || l.item_specifics?.Department || "";
  return /^men\b/i.test(d.trim()) ? "Men" : "Women";
}

const NUM = String.raw`\d{1,2}(?:\.5)?`;
// American width letters stamped right after the size — 7M, 8.5W, 9 N, 10.5D.
// They exist only in the US system, so "7M" is a US 7, Medium width. The
// letter stays as it was written: a wide or narrow fit is what some buyers
// search for.
const WIDTH = String.raw`(?:M|W|N|B|C|D|E|EE|EEE|2E|3E|4E|WW|XW|AA|AAA)`;

/**
 * Put both sizes in a shoe title, US first, in the form the seller uses:
 * "6.5 37", "7M 37.5" — no "EU" between them (her rule of 26 Oct 2026: buyers
 * understand, and the word only takes room). Corrects a US size that disagrees
 * with eBay's chart. Leaves the title untouched when the item is not footwear,
 * when the size is not on the chart, or when the result would not fit `limit`.
 */
export function shoeSizesInTitle(
  title: string,
  listing: ListingResult,
  limit = 80,
): string {
  if (!isFootwear(listing)) return title;
  const dept = shoeDepartment(listing);
  const usFor = (eu: string) => findShoeSizeRow(eu, dept, "eu")?.us;
  const euFor = (us: string) => findShoeSizeRow(us, dept, "us")?.eu[0];
  const isUs = (n: string) => Number(n) >= 1 && Number(n) <= 16;
  const isEu = (n: string) => Number(n) >= 33 && Number(n) <= 50;

  let out = title;
  // A pair already written, with or without "EU" (and a stray "US" in front):
  // "6.5 EU 37", "US 7M EU 37.5", "7M 37.5". Both numbers must look like what
  // they claim to be, so a model number ("Air Max 90 38") is never read as one.
  const pair = new RegExp(
    String.raw`(?:\bUS\s+)?\b(${NUM})(${WIDTH})?\s+(?:EU\s+)?(${NUM})\b`,
    "gi",
  );
  const euOnly = new RegExp(String.raw`(^|\s)EU\s+(${NUM})\b`, "i");
  const euAfter = new RegExp(String.raw`\b(${NUM})\s+EU\b(?!\s+\d)`, "i");
  const usOnly = new RegExp(String.raw`\bUS\s+(${NUM})(${WIDTH})?\b`, "i");
  const sizeEu = new RegExp(String.raw`\bSize\s+(${NUM})\b`, "i");
  // Upper case only: "7m" on its own is more likely metres than a width.
  const usWidth = new RegExp(String.raw`\b(${NUM})\s?(${WIDTH})\b`);

  const found = [...out.matchAll(pair)].find((p) => isUs(p[1]) && isEu(p[3]));
  let m: RegExpMatchArray | null;
  if (found) {
    // "7 EU 37" → "6.5 37": the chart decides the US half, and "EU" goes.
    const us = usFor(found[3]) ?? found[1];
    out =
      out.slice(0, found.index) +
      `${us}${found[2] ?? ""} ${found[3]}` +
      out.slice((found.index ?? 0) + found[0].length);
  } else if ((m = out.match(usOnly))) {
    // "US 6.5" → "6.5 37", "US 7M" → "7M 37.5"
    const eu = euFor(m[1]);
    if (eu) out = out.replace(usOnly, `${m[1]}${m[2] ?? ""} ${eu}`);
  } else if ((m = out.match(usWidth))) {
    // "7M" → "7M 37.5"
    const eu = euFor(m[1]);
    if (eu) out = out.replace(usWidth, `${m[1]}${m[2]} ${eu}`);
  } else if ((m = out.match(euOnly)) && isEu(m[2])) {
    // "EU 37" → "6.5 37"
    const us = usFor(m[2]);
    if (us) out = out.replace(euOnly, `${m[1]}${us} ${m[2]}`);
  } else if ((m = out.match(euAfter)) && isEu(m[1])) {
    // "37 EU" → "6.5 37"
    const us = usFor(m[1]);
    if (us) out = out.replace(euAfter, `${us} ${m[1]}`);
  } else if ((m = out.match(sizeEu)) && isEu(m[1])) {
    // A bare 37 on a shoe is European — no US or UK size runs that high.
    const us = usFor(m[1]);
    if (us) out = out.replace(sizeEu, `Size ${us} ${m[1]}`);
  }

  out = out.replace(/\s{2,}/g, " ").trim();
  if (out.length <= limit) return out;
  // The seller's own second trimming step: the word "Size" goes, the value stays.
  const shorter = out.replace(/\bSize\s+/i, "").trim();
  return shorter.length <= limit ? shorter : title;
}
