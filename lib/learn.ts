import { z } from "zod";
import {
  ITEM_KINDS,
  KIND_LABEL,
  RULE_FIELDS,
  ruleLine,
  type CardChanges,
  type ItemKind,
  type SellerRule,
} from "./learn-diff";

/**
 * The AI that reads what the seller changed on a card and writes it down as
 * short rules for similar items (18 Nov 2026). Text only, a cent or two.
 */

/** The most rules one card can teach. */
export const MAX_NEW_RULES = 4;

export const LEARN_SCHEMA = {
  type: "object",
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", enum: [...RULE_FIELDS] },
          rule: { type: "string" },
        },
        required: ["field", "rule"],
        additionalProperties: false,
      },
    },
  },
  required: ["rules"],
  additionalProperties: false,
} as const;

export const LEARN_RULES = `You learn an eBay seller's preferences from her own corrections. The program wrote a listing; she changed it before posting. You get the program's version and hers, the kind of item, her notes about the item, and the rules she already has.

Write down, as short rules for SIMILAR items, what her changes show about how she wants listings written: her wording, tone and words she removes or adds; what goes first or last; what she always includes or never includes; how she shapes the title; which item specifics values she prefers when several are true.

Never make a rule from a correction of a FACT about this one item — a wrong size, colour, measurement, brand, material, stone, flaw, age or price. That fixes this item; it says nothing about the next one. A change that only repeats what her notes say is also a fact about this item.

Each rule: one plain imperative sentence a writer can follow, at most 25 words, about the general pattern, with a short example in quotes when it helps ("Put the metal before the stone: 'Sterling Silver Garnet Ring'"). Never name this item's own facts in a rule unless they are the example.

Do not repeat a rule she already has, and do not contradict one unless her change clearly overrides it — then write the new rule. Return at most ${MAX_NEW_RULES} rules, the clearest first. When the changes show no preference beyond this item's facts, return no rules: an empty list is the right answer often.`;

export interface LearnRequest {
  kind: ItemKind;
  item: string;
  notes: string;
  changes: CardChanges;
  /** The rules she already has for this kind of item. */
  known: string[];
}

const changeSchema = z.object({ before: z.string().max(6000), after: z.string().max(6000) });

export const learnRequestSchema = z.object({
  kind: z.enum(ITEM_KINDS),
  item: z.string().max(120),
  notes: z.string().max(2000),
  changes: z.object({
    title: changeSchema.optional(),
    description: changeSchema.optional(),
    specifics: z
      .array(z.object({ name: z.string().max(100), before: z.string().max(300), after: z.string().max(300) }))
      .max(30)
      .optional(),
  }),
  known: z.array(z.string().max(400)).max(60),
});

export function learnMessage(r: LearnRequest): string {
  const parts = [
    `KIND OF ITEM: ${KIND_LABEL[r.kind]} — ${r.item || "item"}`,
    `HER NOTES ABOUT THIS ITEM: ${r.notes.trim() || "(none)"}`,
  ];
  if (r.changes.title)
    parts.push(`TITLE\nProgram: ${r.changes.title.before}\nHers:    ${r.changes.title.after}`);
  if (r.changes.description)
    parts.push(
      `DESCRIPTION — the program's:\n${r.changes.description.before}\n\nDESCRIPTION — hers:\n${r.changes.description.after}`,
    );
  if (r.changes.specifics?.length)
    parts.push(
      `ITEM SPECIFICS\n${r.changes.specifics
        .map((s) => `${s.name}: "${s.before || "(empty)"}" → "${s.after || "(empty)"}"`)
        .join("\n")}`,
    );
  parts.push(
    `RULES SHE ALREADY HAS FOR THIS KIND OF ITEM:\n${r.known.length ? r.known.map((k) => `- ${k}`).join("\n") : "(none)"}`,
  );
  parts.push("Return her new rules now.");
  return parts.join("\n\n");
}

/** The AI's answer kept to the rules' own shape; nothing else gets through. */
export function cleanRules(raw: unknown, kind: ItemKind): SellerRule[] {
  const list = (raw as { rules?: unknown })?.rules;
  if (!Array.isArray(list)) return [];
  const out: SellerRule[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    const field = (r as { field?: unknown })?.field;
    const rule = String((r as { rule?: unknown })?.rule ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!RULE_FIELDS.includes(field as (typeof RULE_FIELDS)[number])) continue;
    if (rule.length < 3 || rule.length > 300) continue;
    const key = rule.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, field: field as SellerRule["field"], rule });
    if (out.length >= MAX_NEW_RULES) break;
  }
  return out;
}

/**
 * Her rules as the writing AI reads them. Grouped by kind of item: only the
 * group this item belongs to applies (her choice — similar items only).
 */
export function sellerRulesText(rules: readonly SellerRule[], intro: string): string {
  if (!rules.length) return "";
  return [
    intro,
    ...rules.map((r) => `- ${ruleLine(r)}`),
  ].join("\n");
}

/** For the first writing, before the category is known: every kind, each labelled. */
export const WRITING_RULES_INTRO =
  "THE SELLER'S RULES, learned from her own corrections of earlier listings, newest first. Each is labelled with the kind of item it belongs to: follow ONLY the rules of the kind this item is (jewelry, clothing, shoes, bags and accessories, home, electronics, other items) and ignore the others. They are her preferences for wording, order and what to include. They never override the facts in the photos, her notes, eBay's own lists, the size charts, the description limit or any rule above, and never make you state a fact you cannot see.";

/** For a text update or the item specifics, when the kind is known. */
export const KIND_RULES_INTRO =
  "THE SELLER'S RULES for this kind of item, learned from her own corrections of earlier listings, newest first. Follow them where the facts allow: they are her preferences, never a reason to state a fact the listing, the photos or her notes do not support, and never a reason to leave eBay's own lists.";
