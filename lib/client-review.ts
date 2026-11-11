import type { ItemGroup } from "./types";
import { shippingSchema, skuSchema } from "./validation";
import { validateAspects } from "./ebay/draft";
import { brandNeedsConfirmation } from "./maker-marks";
import { offerChoice, offerProblem } from "./offers";
/**
 * One thing that stops a draft from being posted, and the field to fix it in
 * (the check bar above the draft links each one to its field — 11 Nov 2026).
 */
export interface DraftIssue {
  text: string;
  /** "title", "description", "price", "sku", "brand", "category", "condition",
   *  "shipping", "photos", "offer", or "aspect:<eBay field name>". */
  field?: string;
}

export function draftIssues(g: ItemGroup): string[] {
  return draftIssueItems(g).map((i) => i.text);
}

export function draftIssueItems(g: ItemGroup): DraftIssue[] {
  const l = g.listing;
  if (!l) return [{ text: "Generate a draft first." }];
  const issues: DraftIssue[] = [];
  if (!skuSchema.safeParse(g.sku).success) issues.push({ text: "Enter a valid SKU.", field: "sku" });
  if (!l.title.trim() || l.title.length > 80)
    issues.push({ text: "Title must be 1–80 characters.", field: "title" });
  if (!l.description.trim()) issues.push({ text: "Enter a description.", field: "description" });
  if (brandNeedsConfirmation(l))
    issues.push({
      text: `Confirm the brand ${l.brand} — the AI read it from a maker's mark, not a label.`,
      field: "brand",
    });
  if (
    !Number.isFinite(Number(l.suggested_price)) ||
    Number(l.suggested_price) <= 0
  )
    issues.push({ text: "Enter a positive price.", field: "price" });
  if (
    !g.preparation ||
    g.preparation.categoryId !== l.category_id ||
    g.preparation.expiresAt < Date.now()
  )
    issues.push({ text: "Prepare this category before publishing.", field: "category" });
  else {
    if (!g.preparation.conditions.some((c) => c.value === l.ebay_condition))
      issues.push({ text: "Choose an eBay condition.", field: "condition" });
    const names = g.preparation.aspects.map((a) => a.name);
    for (const text of validateAspects(
      Object.fromEntries(
        Object.entries(l.item_specifics ?? {})
          .filter(([, v]) => v.trim())
          .map(([k, v]) => [k, v.split(" | ").map((x) => x.trim())]),
      ),
      g.preparation.aspects,
    )) {
      // Every aspect message names its field; the longest name that appears wins
      // ("Size Type" over "Size").
      const name = names
        .filter((n) => text.includes(n))
        .sort((a, b) => b.length - a.length)[0];
      issues.push({ text, field: name ? `aspect:${name}` : undefined });
    }
  }
  if (!shippingSchema.safeParse(g.shipping).success)
    issues.push({
      text: "Choose policies and shipping origin. Package measurements are optional; if supplied, enter valid values and all three dimensions.",
      field: "shipping",
    });
  if (!g.photoIds.length || g.photoIds.length > 24)
    issues.push({ text: "Select 1–24 photos for this item.", field: "photos" });
  const offer = offerProblem(offerChoice(g), l.suggested_price);
  if (offer) issues.push({ text: offer, field: "offer" });
  return issues;
}
