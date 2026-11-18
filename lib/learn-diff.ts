import { z } from "zod";
import type { ListingResult } from "./types";

/**
 * Learning from the seller's own corrections (her wish, 18 Nov 2026: "the
 * program should learn what I want — my style, my preferences, what I don't
 * like"). Every card keeps the version the program first wrote; when she
 * posts it or saves it to History, what she changed in the title, the
 * description, the item specifics and the category is compared here, and the
 * AI turns it into short rules — for similar items only (her choice).
 */

/** The kinds of item a rule belongs to: a rule from jewellery stays with jewellery. */
export const ITEM_KINDS = ["jewelry", "clothing", "shoes", "bags", "home", "electronics", "other"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const KIND_LABEL: Record<ItemKind, string> = {
  jewelry: "Jewelry",
  clothing: "Clothing",
  shoes: "Shoes",
  bags: "Bags and accessories",
  home: "Home",
  electronics: "Electronics",
  other: "Other items",
};

/** The kind of item, from eBay's category path (the words of the item when there is none yet). */
export function itemKind(
  categoryPath: string | undefined,
  l?: Pick<ListingResult, "item_type" | "title">,
): ItemKind {
  // eBay's top level for clothing names shoes and accessories too: the
  // levels under it tell which of the three the item is.
  const path = (categoryPath ?? "").toLowerCase().replace(/clothing,\s*shoes\s*&\s*accessories/g, "");
  const words = `${l?.item_type ?? ""} ${l?.title ?? ""}`.toLowerCase();
  const text = path || words;
  if (/jewel|watch|earring|necklace|bracelet|brooch|pendant|\bring\b|charm/.test(text)) return "jewelry";
  if (/\bshoes?\b|boots?\b|sneakers?|sandals?|heels\b|loafers?|flats\b|pumps\b/.test(text)) return "shoes";
  // Before bags: "Cell Phones & Accessories" is electronics.
  if (/electronic|computer|cell phone|phone|camera|video game|tablet|laptop|audio|tv\b/.test(text)) return "electronics";
  if (/handbag|\bbags?\b|purse|wallet|backpack|tote|clutch|belts?\b|scarf|scarves|hats?\b|sunglasses|accessories/.test(text))
    return "bags";
  if (/clothing|dress|shirt|\btops?\b|pants|jeans|skirt|jacket|coat|sweater|blouse|shorts|suit\b/.test(text))
    return "clothing";
  if (/home|kitchen|decor|pottery|glass|art\b|painting|furniture|garden|collectible/.test(text)) return "home";
  return "other";
}

/** The version the program wrote, kept on the card to compare against. */
export interface LearnBase {
  title: string;
  description: string;
  item_specifics: Record<string, string>;
  category_id?: string;
  category_path?: string;
}

export function baselineOf(l: ListingResult): LearnBase {
  return {
    title: l.title ?? "",
    description: l.description ?? "",
    item_specifics: { ...(l.item_specifics ?? {}) },
    ...(l.category_id ? { category_id: l.category_id } : {}),
    ...(l.category_path ? { category_path: l.category_path } : {}),
  };
}

/** What she changed — each part only when it changed. */
export interface CardChanges {
  title?: { before: string; after: string };
  description?: { before: string; after: string };
  specifics?: { name: string; before: string; after: string }[];
  category?: { before: string; after: string; id: string };
}

const same = (a: string | undefined, b: string | undefined) =>
  (a ?? "").replace(/\s+/g, " ").trim() === (b ?? "").replace(/\s+/g, " ").trim();

/** Her changes since the program wrote the card, or null when there are none. */
export function cardChanges(base: LearnBase, now: ListingResult): CardChanges | null {
  const out: CardChanges = {};
  if (!same(base.title, now.title))
    out.title = { before: base.title.slice(0, 6000), after: (now.title ?? "").slice(0, 6000) };
  if (!same(base.description, now.description))
    out.description = {
      before: base.description.slice(0, 6000),
      after: (now.description ?? "").slice(0, 6000),
    };
  const nowSpecs = now.item_specifics ?? {};
  const names = new Set([...Object.keys(base.item_specifics), ...Object.keys(nowSpecs)]);
  const specifics = [...names]
    .filter((n) => !same(base.item_specifics[n], nowSpecs[n]))
    .map((n) => ({
      name: n.slice(0, 100),
      before: (base.item_specifics[n] ?? "").slice(0, 300),
      after: (nowSpecs[n] ?? "").slice(0, 300),
    }));
  if (specifics.length) out.specifics = specifics.slice(0, 30);
  if (now.category_id && base.category_id && now.category_id !== base.category_id)
    out.category = {
      before: base.category_path || base.category_id,
      after: now.category_path || now.category_id,
      id: now.category_id,
    };
  return Object.keys(out).length ? out : null;
}

/** Whether the text changes need the AI (a category change alone does not). */
export const needsRules = (c: CardChanges) => Boolean(c.title || c.description || c.specifics?.length);

/** One rule, as the AI writes it and the seller reads it. */
export const RULE_FIELDS = ["title", "description", "item_specifics"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export interface SellerRule {
  kind: ItemKind;
  field: RuleField;
  rule: string;
}

export const sellerRuleSchema = z.object({
  kind: z.enum(ITEM_KINDS),
  field: z.enum(RULE_FIELDS),
  rule: z.string().trim().min(3).max(300),
});

/** The most rules that go along with one listing. */
export const MAX_RULES = 40;

export const sellerRulesSchema = z.array(sellerRuleSchema).max(MAX_RULES);

const FIELD_LABEL: Record<RuleField, string> = {
  title: "Title",
  description: "Description",
  item_specifics: "Item specifics",
};

/** "[Jewelry] Title: put the metal before the stone." */
export function ruleLine(r: Pick<SellerRule, "kind" | "field" | "rule">): string {
  return `[${KIND_LABEL[r.kind]}] ${FIELD_LABEL[r.field]}: ${r.rule}`;
}

/** Only this kind of item's rules, optionally for one field. */
export function rulesFor<T extends Pick<SellerRule, "kind" | "field">>(
  rules: readonly T[],
  kind: ItemKind,
  field?: RuleField,
): T[] {
  return rules.filter((r) => r.kind === kind && (!field || r.field === field));
}
