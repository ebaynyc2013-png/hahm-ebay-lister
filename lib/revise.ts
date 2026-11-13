// "Update with notes" and the doubt buttons (12 Nov 2026): the written
// listing is corrected from a new fact the seller typed or a choice she
// clicked — TEXT ONLY, no photos, so it costs cents instead of a full
// Re-analyze. The model gets the listing as it stands and the new facts, and
// returns the title, the description, the condition notes and only the item
// specifics that change.
//
// Client-safe: no server imports.

import { tidyConditionNotes } from "./condition-sync";
import { formatDescription } from "./description-format";
import { fitTitle } from "./title-fit";
import { COLOR_SYNONYMS, isChoiceSet, isColorAspect, toAllowedValue } from "./ebay/aspects";
import type { AspectMeta } from "./ebay/taxonomy";
import type { ListingResult } from "./types";

export const REVISE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    condition_notes: { type: "string" },
    changed_specifics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, value: { type: "string" } },
        required: ["name", "value"],
      },
    },
    removed_specifics: { type: "array", items: { type: "string" } },
  },
  required: ["title", "description", "condition_notes", "changed_specifics", "removed_specifics"],
};

export const REVISE_RULES = `You correct an eBay listing that is already written, from new facts the seller gives you. You see no photos — only the listing and her words. Her facts are true; they win over anything in the listing.

Change ONLY what her new facts touch, everywhere they appear: the title, the description, the condition notes and the item specifics. Keep every other word, line and value exactly as it is — her own edits are in there. Never invent a fact she did not give and the listing does not already state.

The rules the listing follows (keep them):
- Title: at most 80 characters, plain words, no punctuation tricks.
- Description: the first line is the title, word for word. Then labeled sections, one blank line between them, at most 800 characters in all. The measurements stand right after the Condition line, one per line, no heading, no bullets: "Length: Approximately 1.5\" (3.8 cm)"; three sides, height first: "Measurements: Approximately 13.5\"H x 16.5\"W x 6.25\"D (34.3 H x 41.9 W x 15.9 D cm)"; two sides without a known height: "Measurements: Approximately 2.75\" x 2\" (7 x 5.1 cm)". The inch mark " right after each number, inches rounded to the nearest quarter, centimetres to one decimal in brackets. The letter x, never ×.
- Condition notes: one line — the grade and a colon, then the points with "• ": "Excellent pre-owned condition: • A • B • C".
- Item specifics: short values; a measurement is the number and "in" only ("1.5 in"), no "Approximately". When an item is made of two metals, Metal and Base Metal take the one there is most of; the other is named in the title and the description.

Return the whole title, the whole description and the whole condition notes (unchanged ones as they are), and in "changed_specifics" ONLY the item specifics whose value changes or that are new; in "removed_specifics" the names of any that are now wrong and have no right value.`;

/** The user turn: the listing as it stands, then her new facts. */
export function reviseMessage(l: ListingResult, facts: string): string {
  const listing = {
    title: l.title,
    description: l.description,
    condition: l.condition,
    condition_notes: l.condition_notes ?? "",
    brand: l.brand ?? "",
    item_specifics: l.item_specifics ?? {},
  };
  return `THE LISTING AS IT STANDS:\n${JSON.stringify(listing, null, 1)}\n\nTHE SELLER'S NEW FACTS (true — correct the listing from them):\n${facts.trim().slice(0, 2000)}\n\nReturn the corrected listing JSON now.`;
}

export interface Revision {
  title?: string;
  description?: string;
  condition_notes?: string;
  changed_specifics?: { name?: string; value?: string }[];
  removed_specifics?: string[];
}

/** The listing patch from a revision, kept to the listing's own rules, and what changed. */
export function applyRevision(
  l: ListingResult,
  r: Revision,
): { patch: Partial<ListingResult>; changed: string[] } {
  const changed: string[] = [];
  const patch: Partial<ListingResult> = {};
  const title = fitTitle(String(r.title ?? ""), 80);
  if (title && title !== l.title) {
    patch.title = title;
    changed.push("Title");
  }
  const finalTitle = patch.title ?? l.title;
  if (typeof r.description === "string" && r.description.trim()) {
    // The first line is the title, word for word — the same guarantee the
    // first writing has.
    const lines = r.description.replace(/\r\n?/g, "\n").trim().split("\n");
    const body = lines.slice(1).join("\n").trim();
    const text = formatDescription(body ? `${finalTitle}\n\n${body}` : finalTitle, undefined, l.brand ?? "").text;
    if (text !== l.description) {
      patch.description = text;
      changed.push("Description");
    }
  }
  if (typeof r.condition_notes === "string" && r.condition_notes.trim()) {
    const notes = tidyConditionNotes(r.condition_notes, l.condition);
    if (notes !== (l.condition_notes ?? "")) {
      patch.condition_notes = notes;
      changed.push("Condition notes");
    }
  }
  const specifics = { ...(l.item_specifics ?? {}) };
  let specificsChanged = false;
  const keyOf = (name: string) =>
    Object.keys(specifics).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
  for (const c of r.changed_specifics ?? []) {
    const name = String(c?.name ?? "").trim();
    const value = String(c?.value ?? "").trim();
    if (!name || !value || name.length > 100 || value.length > 500) continue;
    const key = keyOf(name);
    if (specifics[key] === value) continue;
    changed.push(specifics[key] ? `${key}: ${specifics[key]} → ${value}` : `${key}: ${value}`);
    specifics[key] = value;
    specificsChanged = true;
  }
  for (const name of r.removed_specifics ?? []) {
    const key = keyOf(String(name ?? ""));
    if (key in specifics && !/^brand$/i.test(key)) {
      changed.push(`${key} removed`);
      delete specifics[key];
      specificsChanged = true;
    }
  }
  if (specificsChanged) patch.item_specifics = specifics;
  return { patch, changed };
}

/**
 * The fields eBay gives a list for take a word from that list (13 Nov 2026:
 * "navy blue" in her notes put Color "Navy Blue" into the item specifics,
 * while eBay's Color list has only "Blue"). Her words stay in the title and
 * the description; the field gets eBay's word. A value with no word on the
 * list is not applied, and the message says so.
 */
export function snapRevisionToLists(
  before: ListingResult,
  rev: { patch: Partial<ListingResult>; changed: string[] },
  aspects: AspectMeta[] | undefined,
): { patch: Partial<ListingResult>; changed: string[] } {
  const next = rev.patch.item_specifics;
  if (!next || !aspects?.length) return rev;
  const old = before.item_specifics ?? {};
  const specifics = { ...next };
  let changed = [...rev.changed];
  const say = (key: string, line: string | null) => {
    changed = changed.filter((c) => !c.toLowerCase().startsWith(`${key.toLowerCase()}:`) && c !== `${key} removed`);
    if (line) changed.push(line);
  };
  for (const [key, value] of Object.entries(next)) {
    if (old[key] === value) continue;
    const a = aspects.find((x) => x.name.toLowerCase() === key.toLowerCase());
    if (!a || !a.values.length) continue;
    if (!(a.mode === "SELECTION_ONLY" || isChoiceSet(a))) continue;
    const synonyms = isColorAspect(a.name) ? COLOR_SYNONYMS : undefined;
    const words = [
      ...new Set(
        String(value)
          .split(" | ")
          .map((v) => toAllowedValue(v.trim(), a.values, synonyms))
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const was = old[key];
    if (!words.length) {
      // Not eBay's word: the field keeps what it had.
      if (was) specifics[key] = was;
      else delete specifics[key];
      say(key, `${key}: "${value}" is not on eBay's list — ${was ? `kept ${was}` : "left empty"}`);
      continue;
    }
    const word = words.join(" | ");
    if (word === value) continue;
    specifics[key] = word;
    say(key, word === was ? `${key} stays ${word} (eBay's word for ${value})` : `${key}: ${was ? `${was} → ` : ""}${word} (eBay's word for ${value})`);
  }
  const same =
    Object.keys(specifics).length === Object.keys(old).length &&
    Object.entries(specifics).every(([k, v]) => old[k] === v);
  const patch = { ...rev.patch };
  if (same) delete patch.item_specifics;
  else patch.item_specifics = specifics;
  return { patch, changed };
}
