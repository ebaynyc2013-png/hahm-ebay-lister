// Shoe titles carry both the US and the EU size — "6.5 EU 37" — and the
// conversion is done here, from eBay's own chart, not by the model.
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
 * "6.5 EU 37". Corrects a US size that disagrees with eBay's chart. Leaves the
 * title untouched when the item is not footwear, when the size is not on the
 * chart, or when the result would not fit in `limit`.
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

  let out = title;
  const pair = new RegExp(
    String.raw`\b(${NUM})(${WIDTH})?\s+EU\s+(${NUM})\b`,
    "i",
  );
  const euOnly = new RegExp(String.raw`(^|\s)EU\s+(${NUM})\b`, "i");
  const euAfter = new RegExp(String.raw`\b(${NUM})\s+EU\b(?!\s+\d)`, "i");
  const usOnly = new RegExp(String.raw`\bUS\s+(${NUM})\b(?!\s+EU)`, "i");
  const sizeEu = new RegExp(String.raw`\bSize\s+(${NUM})\b(?!\s+EU)`, "i");
  // Upper case only: "7m" on its own is more likely metres than a width.
  const usWidth = new RegExp(String.raw`\b(${NUM})\s?(${WIDTH})\b(?!\s+EU)`);

  let m: RegExpMatchArray | null;
  if ((m = out.match(pair))) {
    // "7 EU 37" → "6.5 EU 37": the chart decides the US half.
    const us = usFor(m[3]);
    if (us && us !== m[1])
      out = out.replace(pair, `${us}${m[2] ?? ""} EU ${m[3]}`);
  } else if ((m = out.match(usWidth))) {
    // "7M" → "7M EU 37.5"
    const eu = euFor(m[1]);
    if (eu) out = out.replace(usWidth, `${m[1]}${m[2]} EU ${eu}`);
  } else if ((m = out.match(euOnly))) {
    const us = usFor(m[2]);
    if (us) out = out.replace(euOnly, `${m[1]}${us} EU ${m[2]}`);
  } else if ((m = out.match(euAfter)) && Number(m[1]) >= 33) {
    // "37 EU" → "6.5 EU 37"
    const us = usFor(m[1]);
    if (us) out = out.replace(euAfter, `${us} EU ${m[1]}`);
  } else if ((m = out.match(usOnly))) {
    // "US 6.5" → "6.5 EU 37"
    const eu = euFor(m[1]);
    if (eu) out = out.replace(usOnly, `${m[1]} EU ${eu}`);
  } else if ((m = out.match(sizeEu)) && Number(m[1]) >= 33) {
    // A bare 37 on a shoe is European — no US or UK size runs that high.
    const us = usFor(m[1]);
    if (us) out = out.replace(sizeEu, `Size ${us} EU ${m[1]}`);
  }

  out = out.replace(/\s{2,}/g, " ").trim();
  if (out.length <= limit) return out;
  // The seller's own second trimming step: the word "Size" goes, the value stays.
  const shorter = out.replace(/\bSize\s+/i, "").trim();
  return shorter.length <= limit ? shorter : title;
}
