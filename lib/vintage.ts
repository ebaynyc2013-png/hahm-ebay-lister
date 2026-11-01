// Vintage — the seller's rules of 31 Oct 2026.
//
// A vintage piece says so in three places at once, or the listing is half
// found: eBay's Vintage field (Yes), the era wherever eBay has a word for it
// (Theme 90s and Retro, Style Vintage or Y2k, a jewellery Era), and the title,
// which opens with "Vintage 90s".
//
//   - "vintage 90s" on her photographed note: all of it, at once.
//   - Nothing on the note, but the photos carry dating clues (a union label,
//     no care label, an old RN tag, a metal zipper): the card offers
//     "Possible vintage: 90s — why", with a box to tick. Nothing changes until
//     she ticks it; unticking puts everything back.
//   - No clues: nothing.
//
// Age is never decided by the look of a design — a new dress made to look like
// the 70s is not from the 70s, and a buyer who gets one sends it back.

import { matchAllowed, MAX_MULTI_VALUES } from "./ebay/aspects";
import type { ListingResult } from "./types";

export interface VintageInfo {
  /** "note": the seller wrote it. "clues": the AI saw dating clues — she decides. */
  source: "note" | "clues";
  /** "90s", "Y2K", "Art Deco"; "" when the note says only "vintage". */
  era: string;
  /** For clues: what was seen, in a few words. */
  reasons?: string;
  /** For clues: ticked by the seller. */
  confirmed?: boolean;
  /** What the tick replaced, so unticking restores it exactly. */
  before?: { title: string; description: string; specifics: Record<string, string | null> };
}

// Named eras, as eBay's jewellery Era list and sellers write them.
const NAMED = [
  "Georgian",
  "Victorian",
  "Edwardian",
  "Art Nouveau",
  "Art Deco",
  "Retro",
  "Mid-Century",
];

/** "1990's", "nineties", "90s" → "90s"; "2000s", "y2k" → "Y2K"; "art deco" → "Art Deco". */
export function normalizeEra(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/\by2k\b|\b(?:early\s+)?2000'?s\b|\b20{3}s?\b/i.test(s)) return "Y2K";
  const words: Record<string, string> = {
    twenties: "20s",
    thirties: "30s",
    forties: "40s",
    fifties: "50s",
    sixties: "60s",
    seventies: "70s",
    eighties: "80s",
    nineties: "90s",
  };
  const w = s.toLowerCase().match(/\b(twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b/);
  if (w) return words[w[1]];
  const d = s.match(/\b(?:19)?([2-9])0\s*['’]?\s*s\b/i) ?? s.match(/\b19([2-9])\d\b/);
  if (d) return `${d[1]}0s`;
  const named = NAMED.find((n) => new RegExp(`\\b${n.replace("-", "[\\s-]?")}\\b`, "i").test(s));
  return named ?? "";
}

/** "Vintage 90s", "Vintage Y2K", or just "Vintage". */
export function vintageLead(era: string): string {
  return era ? `Vintage ${era}` : "Vintage";
}

const LEAD = /^vintage(?:\s+(?:\d0s|\d{4}s|y2k|art deco|art nouveau|victorian|edwardian|georgian|retro|mid[\s-]?century))?\s+/i;

/**
 * The title opening with "Vintage 90s". When that pushes it past `limit`,
 * words come off the end — never the size, never the brand.
 */
export function vintageTitle(title: string, era: string, l?: Partial<ListingResult>, limit = 80): string {
  const rest = String(title ?? "").replace(/\s+/g, " ").trim().replace(LEAD, "");
  const lead = vintageLead(era);
  let words = `${lead} ${rest}`.trim().split(" ");
  const keep = new Set(
    [
      ...lead.split(" "),
      ...String(l?.size ?? "").split(/[\s/]+/),
      ...String(l?.brand ?? "").split(/\s+/),
      "Small",
      "Medium",
      "Large",
      "Extra",
      "X-Small",
      "X-Large",
    ]
      .map((w) => w.toLowerCase())
      .filter(Boolean),
  );
  const leadCount = lead.split(" ").length;
  let trimmed = false;
  while (words.join(" ").length > limit) {
    let i = words.length - 1;
    while (i >= leadCount && keep.has(words[i].toLowerCase())) i--;
    if (i < leadCount) break;
    words = [...words.slice(0, i), ...words.slice(i + 1)];
    trimmed = true;
  }
  // Never leave half a phrase behind: "… Short" without its "Sleeve".
  while (trimmed && words.length > leadCount && DANGLING.test(words[words.length - 1]))
    words = words.slice(0, -1);
  return words.join(" ");
}

const DANGLING = /^(?:short|long|cap|half|puff|3\/4|three|button|wide|high|low|and|with|&)$/i;

/** The title without its "Vintage 90s" opening. */
export function withoutVintageLead(title: string): string {
  return String(title ?? "").trim().replace(LEAD, "");
}

type Meta = { name: string; values: string[]; cardinality?: string };

function field(meta: Meta[], name: RegExp): Meta | undefined {
  return meta.find((a) => name.test(a.name.trim()));
}

/**
 * Vintage = Yes; Theme gets the decade and Retro; Style gets Vintage (Y2k for
 * Y2K, the decade where eBay's Style list has one); a jewellery Era gets its
 * named era. Only eBay's own words, only where the category asks.
 */
export function applyVintageAspects(
  aspects: Record<string, string[]>,
  meta: Meta[],
  eraRaw: string,
): string[] {
  const era = normalizeEra(eraRaw) || String(eraRaw ?? "").trim();
  const changed: string[] = [];
  const put = (a: Meta | undefined, wanted: string[]) => {
    if (!a) return;
    const words = wanted
      .map((w) => matchAllowed(w, a.values))
      .filter((w): w is string => Boolean(w));
    if (!words.length) return;
    const current = aspects[a.name] ?? [];
    const next =
      a.cardinality === "MULTI"
        ? [...new Set([...words, ...current])].slice(0, MAX_MULTI_VALUES)
        : [words[0]];
    if (next.join("|") !== current.join("|")) {
      aspects[a.name] = next;
      changed.push(a.name);
    }
  };
  put(field(meta, /^vintage$/i), ["Yes"]);
  const decade = /^\d0s$/.test(era) ? era : "";
  put(field(meta, /^theme$/i), [decade, "Retro"].filter(Boolean));
  put(
    field(meta, /^style$/i),
    era === "Y2K" ? ["Y2k", "Vintage"] : ["Vintage", decade].filter(Boolean),
  );
  const eraField = field(meta, /^era$/i);
  if (eraField && era && !decade && era !== "Y2K") {
    const named = eraField.values.find((v) =>
      v.toLowerCase().replace(/\s*\(.*$/, "").replace(/-/g, " ") ===
      era.toLowerCase().replace(/-/g, " "),
    );
    if (named) put(eraField, [named]);
  }
  return changed;
}

const FIELDS = [/^vintage$/i, /^theme$/i, /^style$/i, /^era$/i];

/** The same, on the card's "a | b" strings. */
export function vintageSpecifics(
  specifics: Record<string, string>,
  meta: Meta[],
  era: string,
): Record<string, string> {
  const aspects: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(specifics))
    aspects[k] = String(v ?? "").split(" | ").map((x) => x.trim()).filter(Boolean);
  // Before Prepare, eBay's lists are not known yet: Vintage Yes now, the rest
  // at Prepare (the tick is kept on the listing).
  if (!meta.length) aspects.Vintage = ["Yes"];
  else applyVintageAspects(aspects, meta, era);
  return Object.fromEntries(Object.entries(aspects).map(([k, v]) => [k, v.join(" | ")]));
}

/**
 * Tick the "Possible vintage" box: title, description's first line and the
 * fields change together, and what they were is kept for unticking.
 */
export function confirmVintage(l: ListingResult, meta: Meta[]): Partial<ListingResult> {
  const v = l.vintage;
  if (!v) return {};
  const specifics = l.item_specifics ?? {};
  const before: Record<string, string | null> = {};
  for (const k of Object.keys(specifics)) if (FIELDS.some((f) => f.test(k))) before[k] = specifics[k];
  const next = vintageSpecifics(specifics, meta, v.era);
  for (const k of Object.keys(next))
    if (FIELDS.some((f) => f.test(k)) && !(k in before)) before[k] = null;
  const title = vintageTitle(l.title, v.era, l);
  return {
    title,
    description: replaceFirstLine(l.description, l.title, title),
    item_specifics: next,
    vintage: { ...v, confirmed: true, before: { title: l.title, description: l.description, specifics: before } },
  };
}

/**
 * Untick: the vintage words come out again and whatever they replaced comes
 * back. Values filled in since the tick (Prepare's photo pass) stay; a title
 * she edited since keeps her edit and loses only its "Vintage 90s".
 */
export function unconfirmVintage(l: ListingResult): Partial<ListingResult> {
  const v = l.vintage;
  if (!v) return {};
  const plain: VintageInfo = { source: v.source, era: v.era, reasons: v.reasons, confirmed: false };
  if (!v.before) return { vintage: plain };
  const era = normalizeEra(v.era);
  const added = (field: string, value: string) => {
    const x = value.trim().toLowerCase();
    if (/^vintage$/i.test(field)) return x === "yes";
    if (/^era$/i.test(field)) return Boolean(era) && x.startsWith(era.toLowerCase());
    return ["vintage", "y2k", "retro", era.toLowerCase()].filter(Boolean).includes(x);
  };
  const specifics = { ...(l.item_specifics ?? {}) };
  for (const k of Object.keys(specifics)) {
    if (!FIELDS.some((f) => f.test(k))) continue;
    const old = v.before.specifics[k];
    const had = String(old ?? "").split(" | ").map((x) => x.trim().toLowerCase());
    const kept = String(specifics[k] ?? "")
      .split(" | ")
      .map((x) => x.trim())
      .filter((x) => x && !(added(k, x) && !had.includes(x.toLowerCase())));
    if (kept.length) specifics[k] = kept.join(" | ");
    else if (old) specifics[k] = old;
    else delete specifics[k];
  }
  const tickTitle = vintageTitle(v.before.title, v.era, l);
  const title = l.title === tickTitle ? v.before.title : withoutVintageLead(l.title);
  return {
    title,
    description: replaceFirstLine(l.description, l.title, title),
    item_specifics: specifics,
    vintage: plain,
  };
}

function replaceFirstLine(description: string, oldTitle: string, newTitle: string): string {
  const lines = String(description ?? "").split("\n");
  if (lines.length && lines[0].trim() === String(oldTitle ?? "").trim()) lines[0] = newTitle;
  return lines.join("\n");
}

/** Read the analysis answer into the listing's vintage, or nothing. */
export function vintageFromAnalysis(raw: unknown): VintageInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { source?: unknown; era?: unknown; reasons?: unknown };
  const era = normalizeEra(r.era);
  if (r.source === "note") return { source: "note", era };
  if (r.source === "clues") {
    const reasons = String(r.reasons ?? "").trim().slice(0, 240);
    if (!reasons) return undefined;
    return { source: "clues", era, reasons, confirmed: false };
  }
  return undefined;
}

/** Does the listing count as vintage for eBay now — her note, or her tick? */
export function isVintage(l: Pick<ListingResult, "vintage">): boolean {
  return Boolean(l.vintage && (l.vintage.source === "note" || l.vintage.confirmed));
}
