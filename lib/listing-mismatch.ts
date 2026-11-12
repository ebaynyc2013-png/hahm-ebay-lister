// Where the title, the description and the item specifics disagree — found
// by the program, free, no AI (the seller, 12 Nov 2026: "любая нестыковка
// между тайтлом, description и item specific"). Each one becomes a doubt at
// the top of the draft with a button for each choice.
//
// Metals: a title saying Bronze while Metal says Brass (the Adajio earrings).
// Colour words ("copper-tone", "gold tone", "silver colored") are colours, not
// metals, and are not counted. Leather against faux leather. A letter size in
// the title against the Size field.
//
// Client-safe: no server imports.

import type { ListingDoubt, ListingResult } from "./types";

const METALS: [string, RegExp][] = [
  ["Gold", /\b(?:yellow |white |rose )?gold\b/],
  ["Silver", /\b(?:sterling |fine )?silver\b/],
  ["Brass", /\bbrass\b/],
  ["Bronze", /\bbronze\b/],
  ["Copper", /\bcopper\b/],
  ["Pewter", /\bpewter\b/],
  ["Stainless Steel", /\b(?:stainless |surgical )?steel\b/],
  ["Titanium", /\btitanium\b/],
  ["Platinum", /\bplatinum\b/],
  ["Aluminum", /\balumin(?:i)?um\b/],
];
// "copper-tone", "gold tone", "silver colored", "gold-toned": a colour.
const TONE = /\b(gold|silver|brass|bronze|copper|pewter|platinum|steel)[\s-]*(?:tones?d?|colou?r(?:ed)?|finish(?:ed)?|look)\b/g;

function metalsIn(text: string): Set<string> {
  const t = ` ${String(text ?? "").toLowerCase().replace(TONE, " ")} `;
  return new Set(METALS.filter(([, re]) => re.test(t)).map(([name]) => name));
}

const LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"];

function letterSizeInTitle(title: string): string {
  const tokens = String(title ?? "").split(/\s+/);
  // "M Medium" — the letter the seller's titles carry before the word.
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (LETTER_SIZES.includes(tok) && /^(?:x*-?small|medium|x*-?large|\d?x+l)$/i.test(tokens[i + 1] ?? "")) return tok;
  }
  return "";
}

function specific(l: ListingResult, name: string): string {
  const s = l.item_specifics ?? {};
  const key = Object.keys(s).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(s[key] ?? "") : "";
}

/** The disagreements between the title, the description and the item specifics. */
export function listingMismatches(l: ListingResult): ListingDoubt[] {
  const out: ListingDoubt[] = [];
  const resolved = new Set((l.doubts_resolved ?? []).map((f) => f.toLowerCase()));
  const title = l.title ?? "";
  const description = (l.description ?? "").split("\n").slice(1).join("\n");

  // Metal.
  const metalField = [specific(l, "Metal"), specific(l, "Base Metal")].join(" ");
  const inFields = metalsIn(metalField);
  const inTitle = metalsIn(title);
  const inText = metalsIn(description);
  const named = new Set([...inTitle, ...inText]);
  const extra = [...named].filter((m) => !inFields.has(m));
  if (!resolved.has("metal") && (inFields.size ? extra.length : inTitle.size && inText.size && [...inTitle].some((m) => !inText.has(m)))) {
    const said = (set: Set<string>) => [...set].join(" and ");
    const options = [...new Set([...inFields, ...inTitle, ...inText])].slice(0, 4);
    const parts: string[] = [];
    if (inTitle.size) parts.push(`the title says ${said(inTitle)}`);
    if (inText.size) parts.push(`the description says ${said(inText)}`);
    if (inFields.size) parts.push(`Metal says ${said(inFields)}`);
    if (options.length > 1)
      out.push({
        field: "Metal",
        options,
        why: `${parts.join(", ")}. Which metal is it? Pick the main one first.`.replace(/^./, (c) => c.toUpperCase()),
      });
  }

  // Leather against faux leather.
  const all = `${title}\n${description}\n${specific(l, "Material")}\n${specific(l, "Upper Material")}\n${specific(l, "Exterior Material")}`.toLowerCase();
  const faux = /\b(?:faux|vegan|pu|synthetic|imitation)\s+leather\b|\bleatherette\b/.test(all);
  const real = /\b(?:genuine |real |full[- ]grain |top[- ]grain )?leather\b/.test(all.replace(/\b(?:faux|vegan|pu|synthetic|imitation)\s+leather\b/g, " "));
  if (!resolved.has("material") && faux && real)
    out.push({
      field: "Material",
      options: ["Leather", "Faux Leather"],
      why: "The listing says both leather and faux leather. Which is it?",
    });

  // A letter size in the title against the Size field.
  const titleSize = letterSizeInTitle(title);
  const sizeField = specific(l, "Size").trim();
  if (!resolved.has("size") && titleSize && LETTER_SIZES.includes(sizeField) && sizeField !== titleSize)
    out.push({
      field: "Size",
      options: [sizeField, titleSize],
      why: `The title says ${titleSize}, Size says ${sizeField}. Which size is it?`,
    });

  return out;
}

/** The writer's own doubts and the program's, one per field, in that order. */
export function allDoubts(l: ListingResult): ListingDoubt[] {
  const resolved = new Set((l.doubts_resolved ?? []).map((f) => f.toLowerCase()));
  const seen = new Set<string>();
  const out: ListingDoubt[] = [];
  for (const d of [...(l.doubts ?? []), ...listingMismatches(l)]) {
    const key = d.field.toLowerCase();
    if (resolved.has(key) || seen.has(key)) continue;
    if (!d.options?.length) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** The writer's doubts, tidied: two to four distinct choices, never the brand. */
export function cleanDoubts(ds: ListingDoubt[] | undefined): ListingDoubt[] {
  return (ds ?? [])
    .map((d) => ({
      field: String(d.field ?? "").trim(),
      why: String(d.why ?? "").trim(),
      options: [...new Set((d.options ?? []).map((o) => String(o).trim()).filter(Boolean))].slice(0, 4),
    }))
    .filter((d) => d.field && !/^brand$/i.test(d.field) && d.options.length >= 2)
    .slice(0, 6);
}
