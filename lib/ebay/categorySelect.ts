import { measuredMessage } from "@/lib/ai-usage";
import {
  getClient,
  parseModelJson,
  anthropicAuthError,
} from "@/lib/anthropic";
import { toImageBlock, type WireImage } from "@/lib/images";
import { remainingTime } from "@/lib/network";
import type { ListingResult } from "@/lib/types";
import { isChoiceSet } from "./aspects";
import {
  categoryAspects,
  suggestLeafCategories,
  type AspectMeta,
  type CategorySuggestion,
} from "./taxonomy";

const CATEGORY_MODEL = "claude-sonnet-4-6";
const MAX_CATEGORY_IMAGES = 24;
const RESULTS_PER_QUERY = 6;
const MAX_CANDIDATES = 8;
const MAX_ASPECTS_SHOWN = 24;
// A required aspect's whole word list is shown when it is this short — long
// enough for Type, Department or Format, short of Brand or Size lists.
const MAX_REQUIRED_VALUES_SHOWN = 40;
const REQUIRED_VALUES_SAMPLE = 12;
export const MAX_ALTERNATIVES = 3;

/** A category the seller can switch to, with the AI's caution if it has one. */
export interface CategoryAlternative extends CategorySuggestion {
  /** Empty, or why a required field of this category may not fit the item. */
  warning: string;
}

export interface CategorySelection {
  selected: CategorySuggestion;
  suggestions: CategorySuggestion[];
  /** 0–3 other candidates that could hold the item, best first. */
  alternatives: CategoryAlternative[];
  confidence: "high" | "medium" | "low";
  reason: string;
}

function clean(value: unknown, max = 160): string {
  return String(value ?? "").trim().slice(0, max);
}

function buildCategoryQueries(listing: ListingResult): string[] {
  const brandAndType = [listing.brand, listing.item_type]
    .map((v) => clean(v, 80))
    .filter(Boolean)
    .join(" ");

  const queries = [
    clean(listing.category_hint, 180),
    brandAndType,
    clean(listing.title, 180),
  ].filter(Boolean);

  return [...new Set(queries.map((q) => q.toLowerCase()))].map(
    (lower) => queries.find((q) => q.toLowerCase() === lower)!,
  );
}

function rankSuggestions(
  resultSets: CategorySuggestion[][],
): CategorySuggestion[] {
  const ranked = new Map<
    string,
    { suggestion: CategorySuggestion; score: number }
  >();

  resultSets.forEach((results) => {
    results.forEach((suggestion, index) => {
      const existing = ranked.get(suggestion.id);
      const score = Math.max(1, RESULTS_PER_QUERY - index);

      if (existing) {
        existing.score += score;
      } else {
        ranked.set(suggestion.id, {
          suggestion,
          score,
        });
      }
    });
  });

  return [...ranked.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.suggestion);
}

/**
 * What the category model sees of one candidate's item specifics.
 *
 * Required aspects come WITH eBay's words when eBay gives a short list: the
 * seller fills fields with eBay's words only, so a category whose required
 * list has no word for the item cannot be filled honestly. A painting once
 * went to Mixed Media & Collage (554), whose required Type offers only
 * Assemblage, Collage and Mosaic, because the model saw the field's name and
 * not its words.
 */
export function describeAspects(meta: AspectMeta[]): {
  required: string[];
  recommended: string[];
} {
  const required = meta
    .filter((a) => a.required || a.usage === "REQUIRED")
    .map((a) => {
      // Brand, Size, numbers: read off the item, not chosen from words.
      if (!isChoiceSet(a)) return a.name;
      if (a.values.length <= MAX_REQUIRED_VALUES_SHOWN)
        return `${a.name} — only one of: ${a.values.join(" | ")}`;
      return `${a.name} — one of ${a.values.length} eBay values, e.g. ${a.values
        .slice(0, REQUIRED_VALUES_SAMPLE)
        .join(" | ")} …`;
    });
  const recommended = meta
    .filter((a) => !(a.required || a.usage === "REQUIRED"))
    .filter((a) => a.usage === "RECOMMENDED")
    .slice(0, MAX_ASPECTS_SHOWN)
    .map((a) => a.name);
  return { required, recommended };
}

/**
 * The model's alternates, made safe: only real candidates from eBay's list,
 * never the chosen category, no repeats, at most three, best first.
 */
export function cleanAlternatives(
  raw: unknown,
  suggestions: CategorySuggestion[],
  selectedId: string,
): CategoryAlternative[] {
  const out: CategoryAlternative[] = [];
  const seen = new Set([selectedId]);
  for (const item of Array.isArray(raw) ? raw : []) {
    const id = clean((item as { categoryId?: unknown })?.categoryId, 20);
    const found = suggestions.find((s) => s.id === id);
    if (!found || seen.has(id)) continue;
    seen.add(id);
    out.push({
      ...found,
      warning: clean((item as { warning?: unknown })?.warning, 200),
    });
    if (out.length >= MAX_ALTERNATIVES) break;
  }
  return out;
}

export async function selectBestLeafCategory(
  listing: ListingResult,
  images: WireImage[],
): Promise<CategorySelection> {
  const queries = buildCategoryQueries(listing);

  if (!queries.length) {
    throw new Error(
      "Could not build an eBay category search from this listing.",
    );
  }

  const resultSets = await Promise.all(
    queries.map((query) =>
      suggestLeafCategories(query, RESULTS_PER_QUERY),
    ),
  );

  const suggestions = rankSuggestions(resultSets);

  if (!suggestions.length) {
    throw new Error(
      "eBay Taxonomy did not return a usable leaf category for this item.",
    );
  }

  const candidateMeta = await Promise.all(
    suggestions.map(async (suggestion) => ({
      suggestion,
      aspects: await categoryAspects(suggestion.id),
    })),
  );

  const candidates = candidateMeta.map(
    ({ suggestion, aspects }, index) => ({
      number: index + 1,
      id: suggestion.id,
      path: suggestion.path,
      ...describeAspects(aspects),
    }),
  );

  const imageBlocks = images
    .slice(0, MAX_CATEGORY_IMAGES)
    .map(toImageBlock)
    .filter(
      (
        block,
      ): block is NonNullable<ReturnType<typeof toImageBlock>> =>
        Boolean(block),
    );

  const listingContext = {
    title: clean(listing.title, 180),
    category_hint: clean(listing.category_hint, 180),
    brand: clean(listing.brand, 100),
    item_type: clean(listing.item_type, 100),
    material: clean(listing.material, 120),
    color: Array.isArray(listing.color)
      ? listing.color.slice(0, 6)
      : clean(listing.color, 100),
    key_features: (listing.key_features ?? [])
      .slice(0, 8)
      .map((v) => clean(v, 120)),
  };

  const prompt = `You are choosing the exact eBay leaf category for ONE physical item.

Inspect ALL supplied photos carefully. The photos are the primary evidence.

The earlier listing analysis is useful context:
${JSON.stringify(listingContext, null, 2)}

eBay Taxonomy has returned these REAL CURRENT LEAF CATEGORIES:
${JSON.stringify(candidates, null, 2)}

Your job:
- Choose the single most accurate category for the actual item shown.
- You MUST choose one of the supplied category IDs.
- NEVER invent a category or category ID.
- Prefer the narrowest accurate category that genuinely matches the physical item.
- Use the entire category path, not merely the final category name.
- Use the supplied eBay aspects as a check. The aspects should make sense for this kind of item.
- REQUIRED aspects that come with eBay's words ("only one of: …") must be filled with one of THOSE words — the seller uses eBay's words only, never her own. If a candidate's required list has no word that truthfully describes this item, that category is WRONG for it: do not choose it. Example: a painting does not belong in a category whose required Type offers only Assemblage, Collage and Mosaic when another candidate is a paintings category.
- Do not choose a category merely because one keyword in the title happens to match.
- Distinguish fundamentally different product families correctly: jewelry, watches, clothing, shoes, bags, auto parts, electronics, art, collectibles, home goods, media, and other categories.
- For jewelry, distinguish item type carefully: necklace, pendant, earrings, ring, bracelet, brooch, charm, etc.
- Do not infer unsupported authenticity, age, precious-metal content, gemstone identity, gender, or other facts merely to force the item into a category.
- Re-check the photos before making the final selection.
- If two categories are close, choose the one whose category path AND item-specific aspect schema best fit the actual item.

Then name the ALTERNATIVES the seller might reasonably pick instead: 1 to ${MAX_ALTERNATIVES} OTHER candidates from the list, best first, each one a category this very item could genuinely be listed in. Never repeat the chosen category. Never list a category for a different kind of item (no guitars, coasters or earrings for a painting) — if fewer candidates genuinely fit, list fewer.
For each alternative give a warning: an empty string, unless one of that category's REQUIRED aspects with eBay's words has no word that fits this item — then say which aspect and why in a few plain words (e.g. "Type offers only Assemblage, Collage, Mosaic — none is a painting").

Return: reason (one or two plain sentences: why the chosen category fits best), the chosen category ID, the alternatives, and your confidence.`;

  try {
    const client = getClient();

    const resp = await measuredMessage(
      "category",
      client,
      {
        model: CATEGORY_MODEL,
        max_tokens: 900,
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              additionalProperties: false,
              // Written in this order: the reasoning comes before the pick.
              properties: {
                reason: {
                  type: "string",
                },
                categoryId: {
                  type: "string",
                  enum: suggestions.map((s) => s.id),
                },
                alternatives: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      categoryId: {
                        type: "string",
                        enum: suggestions.map((s) => s.id),
                      },
                      warning: { type: "string" },
                    },
                    required: ["categoryId", "warning"],
                  },
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
              },
              required: ["reason", "categoryId", "alternatives", "confidence"],
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      },
      {
        timeout: remainingTime(45_000),
        maxRetries: 0,
      },
    );

    const block = resp.content.find((b) => b.type === "text");
    const text =
      block && block.type === "text" ? block.text : "";

    const result = parseModelJson<{
      categoryId: string;
      alternatives?: unknown;
      confidence: "high" | "medium" | "low";
      reason: string;
    }>(text);

    const selected = suggestions.find(
      (candidate) => candidate.id === result.categoryId,
    );

    if (!selected) {
      throw new Error(
        "Category model returned a category outside the eBay candidate list.",
      );
    }

    return {
      selected,
      suggestions,
      alternatives: cleanAlternatives(
        result.alternatives,
        suggestions,
        selected.id,
      ),
      confidence: result.confidence,
      reason: clean(result.reason, 400),
    };
  } catch (e) {
    const fatal = anthropicAuthError(e);
    if (fatal) throw fatal;

    throw new Error(
      `Could not verify the best eBay category from the photos: ${
        e instanceof Error ? e.message : "unknown error"
      }`,
    );
  }
}
