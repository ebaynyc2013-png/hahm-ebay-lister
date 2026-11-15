// Statement pieces (the seller's rules, 15 Nov 2026). A statement piece is a
// large, eye-catching piece of jewellery of any kind, and whether a piece is
// one is decided ONLY by a measurement — a ruler or tape in a photo, her
// photographed note, her typed Notes, or the exact same item found online with
// its measurements. Never by eye.
//
// A statement piece: Style "Statement" in the item specifics, a statement
// hashtag, her phrases for big pieces — and never "Statement" in the title
// (eBay Product Research, 15 Nov 2026: buyers find these through the Style
// field). Any other piece: the words statement, bold, chunky, oversized and
// massive nowhere, and none of her phrases for big pieces. Nothing measures
// it and it may be big: she is asked, "Statement? Yes / No".
//
// Client-safe: no server imports.

import { STYLE_PHRASES } from "./style-phrases";
import type { AspectMeta } from "./ebay/taxonomy";
import type { ListingDoubt, ListingResult, StatementInfo } from "./types";

export const STATEMENT_ANSWERS = ["yes", "no", "unsure", "not_jewelry"] as const;

/** The words a piece that is not a statement piece never carries. */
const BIG_WORDS = /\b(?:statement|bold|chunky|oversized|over-sized|massive)\b/gi;
/** The same inside a hashtag or an Etsy tag ("#chunkynecklace"). */
const BIG_IN_TAG = /statement|bold|chunky|over-?sized|massive/i;

/** The writer's answer, tidied; nothing usable — no answer at all. */
export function statementFromAnalysis(raw: unknown): StatementInfo | undefined {
  const r = (raw ?? {}) as { answer?: unknown; measure?: unknown };
  const answer = String(r.answer ?? "").trim().toLowerCase();
  if (!(STATEMENT_ANSWERS as readonly string[]).includes(answer)) return undefined;
  return {
    answer: answer as StatementInfo["answer"],
    measure: String(r.measure ?? "").trim().slice(0, 300),
  };
}

/**
 * The rules hold for jewellery the writer answered for. A listing written
 * before 15 Nov 2026 has no answer, and nothing about it changes.
 */
export function statementApplies(l: Pick<ListingResult, "statement">): boolean {
  const a = l.statement?.answer;
  return a === "yes" || a === "no" || a === "unsure";
}

export function isStatement(l: Pick<ListingResult, "statement">): boolean {
  return l.statement?.answer === "yes";
}

/** "Statement" is never in the title — unless it is part of the brand's own name. */
export function statementOutOfTitle(title: string, brand = ""): string {
  if (/\bstatement\b/i.test(brand)) return title;
  return String(title ?? "").replace(/\bstatement\b/gi, " ").replace(/\s{2,}/g, " ").trim();
}

/** The big-piece words in a text, each once, in lower case. */
export function bigWords(text: string): string[] {
  return [...new Set((String(text ?? "").match(BIG_WORDS) ?? []).map((w) => w.toLowerCase()))];
}

/** The size one of her phrases is for: "small", "statement", or "" for any. */
export function phraseScale(id: string | undefined): string {
  return STYLE_PHRASES.find((p) => p.id === id)?.scale ?? "";
}

/** The piece's word for its statement hashtag and Etsy tag. */
export function statementWord(l: Pick<ListingResult, "item_type" | "title">): string {
  const t = `${l.item_type ?? ""} ${l.title ?? ""}`.toLowerCase();
  if (/earring/.test(t)) return "earrings";
  if (/necklace|choker|lariat|collar/.test(t)) return "necklace";
  if (/pendant/.test(t)) return "pendant";
  if (/bracelet|bangle/.test(t)) return "bracelet";
  if (/\bcuff\b/.test(t)) return "cuff";
  if (/brooch/.test(t)) return "brooch";
  if (/\brings?\b/.test(t)) return "ring";
  return "jewelry";
}

/**
 * The hashtags and Etsy tags kept to the rule: a statement piece has its
 * statement hashtag (in place of the second what-it-is one) and Etsy tag
 * (fourth, after the three most important); any other piece has no tag with
 * a big-piece word.
 */
export function statementTags(
  l: Pick<ListingResult, "statement" | "hashtags" | "etsy_tags" | "item_type" | "title">,
): { hashtags: string[]; etsy_tags: string[] } {
  let hashtags = [...(l.hashtags ?? [])];
  let etsy = [...(l.etsy_tags ?? [])];
  if (!statementApplies(l)) return { hashtags, etsy_tags: etsy };
  if (!isStatement(l)) {
    hashtags = hashtags.filter((t) => !BIG_IN_TAG.test(t));
    etsy = etsy.filter((t) => !BIG_IN_TAG.test(t));
    return { hashtags, etsy_tags: etsy };
  }
  const word = statementWord(l);
  if (!hashtags.some((t) => /statement/i.test(t))) {
    const tag = `#statement${word}`;
    if (hashtags.length >= 5) hashtags.splice(1, 1, tag);
    else hashtags.splice(Math.min(1, hashtags.length), 0, tag);
  }
  if (!etsy.some((t) => /statement/i.test(t))) {
    etsy.splice(Math.min(3, etsy.length), 0, `statement ${word}`);
    etsy = etsy.slice(0, 13);
  }
  return { hashtags, etsy_tags: etsy };
}

/**
 * The tag fields to change for this statement answer — the tags as first
 * written too, so what the seller herself changed in them is still hers
 * when she presses Remember (tag-memory.ts), not the program's doing.
 */
export function statementTagPatch(l: ListingResult, statement: StatementInfo | undefined): Partial<ListingResult> {
  const next = { ...l, statement };
  const out: Partial<ListingResult> = {};
  const same = (a: string[], b: string[] | undefined) => a.join("\n") === (b ?? []).join("\n");
  const now = statementTags(next);
  if (!same(now.hashtags, l.hashtags)) out.hashtags = now.hashtags;
  if (!same(now.etsy_tags, l.etsy_tags)) out.etsy_tags = now.etsy_tags;
  const first = statementTags({ ...next, hashtags: l.hashtags_original ?? [], etsy_tags: l.etsy_tags_original ?? [] });
  if (l.hashtags_original && !same(first.hashtags, l.hashtags_original)) out.hashtags_original = first.hashtags;
  if (l.etsy_tags_original && !same(first.etsy_tags, l.etsy_tags_original)) out.etsy_tags_original = first.etsy_tags;
  return out;
}

const styleKey = (specifics: Record<string, string>) =>
  Object.keys(specifics).find((k) => /^style$/i.test(k.trim()));

/** The item specifics without "Statement" in Style. */
export function withoutStatementStyle(specifics: Record<string, string> | undefined): Record<string, string> {
  const out = { ...(specifics ?? {}) };
  const key = styleKey(out);
  if (!key) return out;
  const values = String(out[key] ?? "")
    .split(" | ")
    .map((v) => v.trim())
    .filter((v) => v && !/^statement$/i.test(v));
  if (values.length) out[key] = values.join(" | ");
  else delete out[key];
  return out;
}

/**
 * eBay's Style at Prepare: "Statement" for a statement piece, when the
 * category's own list has it; never for any other piece.
 */
export function applyStatementStyle(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[]; cardinality?: string }[],
  listing: Pick<ListingResult, "statement">,
): boolean {
  if (!statementApplies(listing)) return false;
  const field = meta.find((a) => /^style$/i.test(a.name.trim()));
  const key = Object.keys(aspects).find((k) => /^style$/i.test(k.trim())) ?? field?.name;
  if (!key) return false;
  const before = (aspects[key] ?? []).map((v) => v.trim()).filter(Boolean);
  let next = before.filter((v) => !/^statement$/i.test(v));
  if (isStatement(listing) && field) {
    const word = field.values.find((v) => /^statement$/i.test(v.trim()));
    if (word && (field.cardinality !== "SINGLE" || !next.length)) next = [...next, word];
  }
  if (next.length === before.length && next.every((v, i) => v === before[i])) return false;
  if (next.length) aspects[key] = next;
  else delete aspects[key];
  return true;
}

/**
 * "Statement? Yes / No" at the top of the draft — free, no AI: when nothing
 * measures a piece that may be big, or when the listing speaks of a big
 * piece ("chunky", one of her phrases for big pieces) that no measurement
 * shows.
 */
export function statementDoubt(l: ListingResult): ListingDoubt | null {
  if (!statementApplies(l) || isStatement(l)) return null;
  const description = (l.description ?? "").split("\n").slice(1).join("\n");
  const words = bigWords(`${l.title ?? ""}\n${description}`);
  const phrase = phraseScale(l.style_phrase_id) === "statement";
  const unsure = l.statement?.answer === "unsure";
  if (!unsure && !words.length && !phrase) return null;
  const parts = [
    unsure
      ? "It may be a statement piece, but nothing measures it."
      : "No measurement shows it is a statement piece.",
  ];
  if (words.length) parts.push(`The listing says ${words.map((w) => `"${w}"`).join(", ")}.`);
  if (phrase) parts.push("The opening sentence is one of your phrases for big pieces.");
  parts.push("Is it a statement piece?");
  return { field: "Statement", options: ["Yes", "No"], why: parts.join(" ") };
}

/** What the text update is told when a piece is not a statement piece. */
export const NOT_STATEMENT_FACTS =
  'This piece is NOT a statement piece. Take the words statement, bold, chunky, oversized and massive out of the title, the description and the item specifics, and reword the sentences they were in so they still read naturally — the opening sentence too, if it speaks of a big piece. Keep every other word, line and value exactly as it is.';

/**
 * Her answer to "Statement? Yes / No": the listing patch the program makes
 * itself (free), and — only when big-piece words must come out of the text —
 * the facts for the text update (a few cents).
 */
export function settleStatement(
  l: ListingResult,
  yes: boolean,
  styleMeta?: Pick<AspectMeta, "values" | "cardinality">,
): { patch: Partial<ListingResult>; facts: string; changed: string[] } {
  const statement: StatementInfo = { answer: yes ? "yes" : "no", measure: "the seller" };
  const tags = statementTagPatch(l, statement);
  const patch: Partial<ListingResult> = { statement, ...tags };
  const changed = [`Statement: ${yes ? "Yes" : "No"}`];
  const before = l.item_specifics ?? {};
  let specifics = withoutStatementStyle(before);
  if (yes && styleMeta) {
    const word = styleMeta.values.find((v) => /^statement$/i.test(v.trim()));
    const key = styleKey(specifics) ?? "Style";
    const values = String(specifics[key] ?? "").split(" | ").map((v) => v.trim()).filter(Boolean);
    if (word && (styleMeta.cardinality !== "SINGLE" || !values.length))
      specifics = { ...specifics, [key]: [...values, word].join(" | ") };
  }
  const styleBefore = before[styleKey(before) ?? ""] ?? "";
  const styleAfter = specifics[styleKey(specifics) ?? ""] ?? "";
  if (styleBefore !== styleAfter) {
    patch.item_specifics = specifics;
    changed.push(yes ? "Style: Statement added" : "Style: Statement removed");
  }
  if (tags.hashtags || tags.etsy_tags) changed.push("Tags");
  const description = (l.description ?? "").split("\n").slice(1).join("\n");
  const needsText =
    !yes && (bigWords(`${l.title ?? ""}\n${description}`).length > 0 || phraseScale(l.style_phrase_id) === "statement");
  return { patch, facts: needsText ? NOT_STATEMENT_FACTS : "", changed };
}
