// eBay's own shoe size conversion chart, from
// https://pages.ebay.com/sell/sizechart.html
//
// The page carries eBay's own caveat: "Exact sizes in this size chart are
// provided by eBay and may vary by brand." So a converted size is a good
// listing value but never a measured fact — callers should keep the size the
// shoe is actually stamped with visible to the buyer rather than quietly
// replacing it.
//
// Rows are transcribed verbatim. Where eBay's EU column lists two spellings of
// one size ("37 37 1/3", "34.5 34 2/3") both are kept, so a shoe stamped
// either way resolves. Women's US 16.5-17 appear twice in eBay's table, out of
// order; the first occurrence wins, which keeps the common sizes correct and
// those outliers out of reach of ordinary listings either way.

import { matchAllowed } from "./ebay/aspects";
import type { AspectMeta } from "./ebay/taxonomy";

export type ShoeDepartment = "Women" | "Men";

export interface ShoeSizeRow {
  us: string;
  uk: string;
  au: string;
  /** Every EU spelling eBay lists for this row. */
  eu: string[];
}

// us, uk, au, eu…
type Raw = [string, string, string, ...string[]];

const WOMENS: Raw[] = [
  ["3", "1", "3", "33.5"],
  ["3.5", "1.5", "3.5", "34"],
  ["4", "2", "4", "34.5", "34 2/3"],
  ["4.5", "2.5", "4.5", "35", "35 1/3"],
  ["5", "3", "5", "35.5"],
  ["5.5", "3.5", "5.5", "36"],
  ["6", "4", "6", "36.5", "36 2/3"],
  ["6.5", "4.5", "6.5", "37", "37 1/3"],
  ["7", "5", "7", "37.5"],
  ["7.5", "5.5", "7.5", "38"],
  ["8", "6", "8", "38.5", "38 2/3"],
  ["8.5", "6.5", "8.5", "39", "39 1/3"],
  ["9", "7", "9", "39.5"],
  ["9.5", "7.5", "9.5", "40"],
  ["10", "8", "10", "40.5", "40 2/3"],
  ["10.5", "8.5", "10.5", "41", "41 1/3"],
  ["11", "9", "11", "41.5"],
  ["11.5", "9.5", "11.5", "42"],
  ["12", "10", "12", "42.5", "42 2/3"],
  ["12.5", "10.5", "12.5", "43", "43 1/3"],
  ["13", "11", "13", "43.5"],
  ["13.5", "11.5", "13.5", "44"],
  ["14", "12", "14", "44.5"],
  ["14.5", "12.5", "14.5", "45", "45.5"],
  ["15", "13", "15", "46", "46.5"],
  ["15.5", "13.5", "15.5", "46.5", "47"],
  ["16", "14", "16", "47.5", "48"],
  ["16.5", "14.5", "16.5", "48.5", "49"],
  ["17", "15", "17", "49.5", "50"],
  ["17.5", "15.5", "17.5", "52.5", "53"],
  ["18", "16", "18", "53.5", "54"],
  ["18.5", "16.5", "18.5", "54.5", "55"],
  ["19", "17", "19", "55.5", "56"],
  ["19.5", "17.5", "19.5", "56.5"],
];

const MENS: Raw[] = [
  ["3", "2", "2", "34", "34.5"],
  ["3.5", "2.5", "2.5", "35"],
  ["4", "3.5", "3.5", "35.5", "36"],
  ["4.5", "4", "4", "36.5", "37"],
  ["5", "4.5", "4.5", "37.5"],
  ["5.5", "5", "5", "38"],
  ["6", "5.5", "5.5", "38.5", "38 2/3"],
  ["6.5", "6", "6", "39", "39 1/3"],
  ["7", "6.5", "6.5", "39.5"],
  ["7.5", "7", "7", "40"],
  ["8", "7.5", "7.5", "40.5", "40 2/3"],
  ["8.5", "8", "8", "41", "41 1/3"],
  ["9", "8.5", "8.5", "41.5"],
  ["9.5", "9", "9", "42"],
  ["10", "9.5", "9.5", "42.5", "42 2/3"],
  ["10.5", "10", "10", "43"],
  ["11", "10.5", "10.5", "43.5"],
  ["11.5", "11", "11", "44"],
  ["12", "11.5", "11.5", "44.5", "44 2/3"],
  ["12.5", "12", "12", "45", "45 1/3"],
  ["13", "12.5", "12.5", "45.5"],
  ["13.5", "13", "13", "46"],
  ["14", "13.5", "13.5", "46.5", "46 2/3"],
  ["14.5", "14", "14", "47", "47 1/3"],
  ["15", "14.5", "14.5", "47.5"],
  ["15.5", "15", "15", "48", "48 2/3"],
  ["16", "15.5", "15.5", "49", "49 1/3"],
  ["16.5", "16", "16", "50", "50 2/3"],
  ["17", "16.5", "16.5", "51", "51 1/3"],
  ["17.5", "17", "17", "52"],
  ["18", "17.5", "17.5", "53"],
  ["18.5", "18", "18", "53.5", "54"],
  ["19", "18.5", "18.5", "54.5", "55"],
  ["19.5", "19", "19", "55.5", "56"],
  ["20", "19.5", "19.5", "56", "56.5"],
];

function toRows(raw: Raw[]): ShoeSizeRow[] {
  return raw.map(([us, uk, au, ...eu]) => ({ us, uk, au, eu }));
}

const TABLE: Record<ShoeDepartment, ShoeSizeRow[]> = {
  Women: toRows(WOMENS),
  Men: toRows(MENS),
};

/** The eBay aspect names this module knows how to fill. */
export const SHOE_SIZE_ASPECTS = {
  us: "US Shoe Size",
  uk: "UK Shoe Size",
  au: "AU Shoe Size",
  eu: "EU Shoe Size",
} as const;

export type SizeSystem = keyof typeof SHOE_SIZE_ASPECTS;

// "37", "EUR 37", "Size 37", "37 EU", "6 1/2" → a bare, comparable size.
function normalizeSize(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\b(eur?o?|us|usa|uk|au|aus|size|sz|women'?s?|men'?s?)\b/g, " ")
    .replace(/[^0-9./\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "6 1/2" → 6.5, "37 1/3" → 37.33…, "38" → 38. NaN for anything else.
function parseSizeNumber(raw: string): number {
  const v = normalizeSize(raw);
  const mixed = v.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = v.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(v);
  return v && Number.isFinite(n) ? n : NaN;
}

function sameSize(a: string, b: string): boolean {
  const [x, y] = [normalizeSize(a), normalizeSize(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [nx, ny] = [parseSizeNumber(x), parseSizeNumber(y)];
  return Number.isFinite(nx) && Number.isFinite(ny) && Math.abs(nx - ny) < 1e-9;
}

/**
 * Find the chart row a size sits on. `system` says which column the value was
 * read from. Omit it and the system is inferred, which only succeeds for a
 * number that can belong to one column alone — a bare "7" is a US size, a UK
 * size and an AU size all at once, and guessing between them would put the
 * wrong size on a listing roughly as often as the right one.
 */
export function findShoeSizeRow(
  size: string,
  department: ShoeDepartment,
  system?: SizeSystem,
): ShoeSizeRow | null {
  const value = normalizeSize(size);
  if (!value) return null;
  const column = system ?? guessSizeSystem(value);
  if (!column) return null;
  return (
    TABLE[department].find((row) =>
      column === "eu"
        ? row.eu.some((eu) => sameSize(eu, value))
        : sameSize(row[column], value),
    ) ?? null
  );
}

/**
 * Every size this shoe can be listed under, keyed by eBay aspect name.
 * Returns {} when the size is not on eBay's chart — better an empty field than
 * an invented one.
 */
export function shoeSizesFor(
  size: string,
  department: ShoeDepartment,
  system?: SizeSystem,
): Partial<Record<string, string>> {
  const row = findShoeSizeRow(size, department, system);
  if (!row) return {};
  return {
    [SHOE_SIZE_ASPECTS.us]: row.us,
    [SHOE_SIZE_ASPECTS.uk]: row.uk,
    [SHOE_SIZE_ASPECTS.au]: row.au,
    // eBay's own first spelling; the alternates exist only for matching.
    [SHOE_SIZE_ASPECTS.eu]: row.eu[0],
  };
}

/**
 * Which column a bare number most likely came from. EU shoe sizes start at 33
 * and US/UK women's stop well below 20, so a plain "37" on an insole is a
 * European size and nothing else. Anything smaller is ambiguous between US and
 * UK, and ambiguous means we say so rather than pick.
 */
export function guessSizeSystem(size: string): SizeSystem | null {
  const value = parseSizeNumber(size);
  if (!Number.isFinite(value)) return null;
  return value >= 25 ? "eu" : null;
}

/**
 * eBay asks for US, UK, EU and AU shoe size as four separate aspects, but a
 * shoe is stamped with one of them — so three sit empty and the listing reads
 * as incomplete to buyers searching in their own system. Fill the rest from
 * whichever one is known, across eBay's published chart.
 *
 * Does nothing unless the department is settled, since the women's and men's
 * charts disagree, and never overwrites a size already on the listing.
 */
export function fillShoeSizes(
  aspects: Record<string, string[]>,
  meta: AspectMeta[],
  rawSize?: unknown,
): void {
  const department = aspects.Department?.[0];
  if (department !== "Women" && department !== "Men") return;

  const wanted = (
    Object.entries(SHOE_SIZE_ASPECTS) as [SizeSystem, string][]
  ).filter(([, name]) => meta.some((a) => a.name === name));
  if (!wanted.length) return;

  // Prefer a size already pinned to a system — the photo pass fills the exact
  // aspect it read ("EU Shoe Size"), which beats guessing from a bare number.
  const known = wanted
    .map(([system, name]) => ({ system, value: aspects[name]?.[0] }))
    .find((entry) => entry.value);

  const sizes = known?.value
    ? shoeSizesFor(known.value, department as ShoeDepartment, known.system)
    : shoeSizesFor(String(rawSize ?? ""), department as ShoeDepartment);
  if (!Object.keys(sizes).length) return;

  for (const [, name] of wanted) {
    const value = sizes[name];
    const aspect = meta.find((a) => a.name === name);
    if (!value || !aspect || aspects[name]?.length) continue;
    const accepted =
      aspect.mode === "SELECTION_ONLY"
        ? matchAllowed(value, aspect.values)
        : value;
    if (accepted) aspects[name] = [accepted];
  }

  // The generic "Size" the analysis produces is not an aspect shoe categories
  // have, so it would ride along as a stray row meaning nothing to eBay.
  if (!meta.some((a) => a.name === "Size")) delete aspects.Size;
}
