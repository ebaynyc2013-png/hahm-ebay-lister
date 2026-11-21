// Shoe titles carry both the US and the EU size — "Size 6.5 EU 37", "Size 7M
// EU 37.5" (the seller, 21 Nov 2026) — and the conversion is done here, from
// eBay's own chart, not by the model.
//
// An insole usually shows one system. Left to the model, EU 37 became whatever
// US size it remembered; the women's and men's charts even disagree with each
// other (EU 37 is women's US 6.5 but men's US 4.5). So the model writes the
// size it read, and this fills in the other one exactly.

import { expectedDepartment } from "./category-selection";
import { findShoeSizeRow, type ShoeDepartment } from "./shoe-sizes";
import { aestheticTail, fitTitle } from "./title-fit";
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
  // Kids' and baby shoes have their own eBay charts (16 Nov 2026).
  const said = [d, l.category_path, l.item_type].filter(Boolean).join(" ");
  if (/\b(?:baby|babies|infants?|newborn|crib)\b/i.test(said)) return "Baby";
  if (/\b(?:boys?|girls?|kids?|youth|toddlers?|children'?s?)\b/i.test(said)) return "Kids";
  return /^men\b/i.test(d.trim()) ? "Men" : "Women";
}

const NUM = String.raw`\d{1,2}(?:\.5)?`;
// American width letters stamped right after the size — 7M, 8.5W, 9 N, 10.5D.
// They exist only in the US system, so "7M" is a US 7, Medium width. The
// letter stays as it was written: a wide or narrow fit is what some buyers
// search for.
const WIDTH = String.raw`(?:M|W|N|B|C|D|E|EE|EEE|2E|3E|4E|WW|XW|AA|AAA)`;

/**
 * Put both sizes in a shoe title, US first, in the seller's form of 21 Nov
 * 2026: "Size 6.5 EU 37", "Size 7M EU 37.5" (it was "6.5 37" from 26 Oct; she
 * changed it — "it should say Size 6 EU 36"). Corrects a US size that disagrees
 * with eBay's chart. Leaves the title untouched when the item is not footwear
 * or when the size is not on the chart.
 *
 * Both sizes always stay (the seller, 21 Nov 2026): when the pair does not fit
 * `limit`, the aesthetic tail at the end goes first, then the word "Size", then
 * whole words from the end — never the sizes. (A Chloé sandal went out as
 * "…Sandals 37 Crossover Round Buckle Block Heel Retro" with no US size.)
 */
export function shoeSizesInTitle(
  title: string,
  listing: ListingResult,
  limit = 80,
): string {
  if (!isFootwear(listing)) return title;
  const dept = shoeDepartment(listing);
  // Baby shoes keep the size as written in the title: eBay's chart gives some
  // of them two US sizes; the description says both (16 Nov 2026).
  if (dept === "Baby") return title;
  const usFor = (eu: string) => findShoeSizeRow(eu, dept, "eu")?.us;
  const euFor = (us: string) => findShoeSizeRow(us, dept, "us")?.eu[0];
  const isUs = (n: string) => Number(n) >= 1 && Number(n) <= 16;
  const isEu = (n: string) => (dept === "Kids" ? Number(n) >= 26 && Number(n) <= 40 : Number(n) >= 33 && Number(n) <= 50);
  const sized = (us: string, width: string | undefined, eu: string) => `Size ${us}${width ?? ""} EU ${eu}`;

  let out = title;
  let block = "";
  // A pair already written, in any form (a "Size" or a stray "US" in front,
  // with or without "EU"): "Size 6.5 EU 37", "US 7M EU 37.5", "7M 37.5". Both
  // numbers must look like what they claim to be, so a model number ("Air Max
  // 90 38") is never read as one.
  const pair = new RegExp(
    String.raw`(?:\bSize\s+)?(?:\bUS\s+)?\b(${NUM})(${WIDTH})?\s+(?:EU\s+)?(${NUM})\b`,
    "gi",
  );
  const euOnly = new RegExp(String.raw`(^|\s)(?:Size\s+)?EU\s+(${NUM})\b`, "i");
  const euAfter = new RegExp(String.raw`(?:\bSize\s+)?\b(${NUM})\s+EU\b(?!\s+\d)`, "i");
  const usOnly = new RegExp(String.raw`(?:\bSize\s+)?\bUS\s+(${NUM})(${WIDTH})?\b`, "i");
  const sizeEu = new RegExp(String.raw`\bSize\s+(${NUM})\b`, "i");
  // Upper case only: "7m" on its own is more likely metres than a width.
  const usWidth = new RegExp(String.raw`(?:\bSize\s+)?\b(${NUM})\s?(${WIDTH})\b`);

  const found = [...out.matchAll(pair)].find((p) => isUs(p[1]) && isEu(p[3]));
  let m: RegExpMatchArray | null;
  if (found) {
    // "7 EU 37" → "Size 6.5 EU 37": the chart decides the US half.
    block = sized(usFor(found[3]) ?? found[1], found[2], found[3]);
    out =
      out.slice(0, found.index) + block + out.slice((found.index ?? 0) + found[0].length);
  } else if ((m = out.match(usOnly))) {
    // "US 6.5" → "Size 6.5 EU 37", "US 7M" → "Size 7M EU 37.5"
    const eu = euFor(m[1]);
    if (eu) out = out.replace(usOnly, (block = sized(m[1], m[2], eu)));
  } else if ((m = out.match(usWidth))) {
    // "7M" → "Size 7M EU 37.5"
    const eu = euFor(m[1]);
    if (eu) out = out.replace(usWidth, (block = sized(m[1], m[2], eu)));
  } else if ((m = out.match(euOnly)) && isEu(m[2])) {
    // "EU 37" → "Size 6.5 EU 37"
    const us = usFor(m[2]);
    if (us) out = out.replace(euOnly, `${m[1]}${(block = sized(us, "", m[2]))}`);
  } else if ((m = out.match(euAfter)) && isEu(m[1])) {
    // "37 EU" → "Size 6.5 EU 37"
    const us = usFor(m[1]);
    if (us) out = out.replace(euAfter, (block = sized(us, "", m[1])));
  } else if ((m = out.match(sizeEu)) && isEu(m[1])) {
    // A bare 37 on a shoe is European — no US or UK size runs that high.
    const us = usFor(m[1]);
    if (us) out = out.replace(sizeEu, (block = sized(us, "", m[1])));
  } else {
    // A bare European number with no mark at all ("…Sandals 37 Crossover…"),
    // taken as a size only when it is the European size the listing read.
    const eu = markedEu(listing);
    const bare = eu && isEu(eu) ? new RegExp(String.raw`(^|\s)${eu.replace(".", "\\.")}(?=\s|$)`) : null;
    const us = eu ? usFor(eu) : undefined;
    if (bare && us && bare.test(out)) out = out.replace(bare, `$1${(block = sized(us, "", eu!))}`);
  }

  const tidy = (s: string) => s.replace(/\s{2,}/g, " ").trim();
  out = tidy(out);
  if (out.length <= limit || !block) return out;
  // No room: the aesthetic tail goes first, then the word "Size", then whole
  // words from the end — the two sizes stay.
  let t = out;
  for (const tail of aestheticTail(t, listing)) {
    t = tidy(t.slice(0, t.length - tail.length));
    if (t.length <= limit) return t;
  }
  const bareBlock = block.replace(/^Size\s+/, "");
  t = tidy(t.replace(block, bareBlock));
  if (t.length <= limit) return t;
  // Whole words go — first from after the sizes, then from just before them.
  const at = t.indexOf(bareBlock);
  if (at < 0) return fitTitle(title, limit);
  const before = t.slice(0, at).split(" ").filter(Boolean);
  const after = t.slice(at + bareBlock.length).split(" ").filter(Boolean);
  const join = () => [...before, bareBlock, ...after].join(" ");
  while (join().length > limit && after.length) after.pop();
  while (join().length > limit && before.length > 1) before.pop();
  const fitted = join().replace(/[\s,;:&/|-]+$/, "");
  return fitted.length <= limit ? fitted : fitTitle(title, limit);
}

/** The European size the listing read ("EU 37" in its size, or the EU Shoe Size field). */
function markedEu(listing: ListingResult): string | undefined {
  const size = String(listing.size ?? "");
  const m = size.match(new RegExp(String.raw`^\s*(?:EU\s+(${NUM})|(${NUM})\s+EU)\s*$`, "i"));
  if (m) return m[1] ?? m[2];
  const field = String(listing.item_specifics?.["EU Shoe Size"] ?? "").trim();
  return new RegExp(String.raw`^${NUM}$`).test(field) ? field : undefined;
}
