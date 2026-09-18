import { measuredMessage } from "@/lib/ai-usage";
import {
  getClient,
  parseModelJson,
  anthropicAuthError,
} from "@/lib/anthropic";
import { toImageBlock, type WireImage } from "@/lib/images";
import { remainingTime } from "@/lib/network";
import type { ListingResult } from "@/lib/types";
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

export interface CategorySelection {
  selected: CategorySuggestion;
  suggestions: CategorySuggestion[];
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

function summarizeAspects(meta: AspectMeta[]): string[] {
  const priority = { REQUIRED: 0, RECOMMENDED: 1, OPTIONAL: 2 } as const;

  return [...meta]
    .sort(
      (a, b) =>
        (priority[a.usage] ?? 2) - (priority[b.usage] ?? 2),
    )
    .slice(0, MAX_ASPECTS_SHOWN)
    .map((aspect) => {
      const tag =
        aspect.usage === "REQUIRED"
          ? " [required]"
          : aspect.usage === "RECOMMENDED"
            ? " [recommended]"
            : "";
      return `${aspect.name}${tag}`;
    });
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
      aspectNames: summarizeAspects(aspects),
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
- Use the supplied eBay aspect names as a sanity check. The aspects should make sense for this kind of item.
- Do not choose a category merely because one keyword in the title happens to match.
- Distinguish fundamentally different product families correctly: jewelry, watches, clothing, shoes, bags, auto parts, electronics, art, collectibles, home goods, media, and other categories.
- For jewelry, distinguish item type carefully: necklace, pendant, earrings, ring, bracelet, brooch, charm, etc.
- Do not infer unsupported authenticity, age, precious-metal content, gemstone identity, gender, or other facts merely to force the item into a category.
- Re-check the photos before making the final selection.
- If two categories are close, choose the one whose category path AND item-specific aspect schema best fit the actual item.

Return the chosen category ID, confidence, and a short reason.`;

  try {
    const client = getClient();

    const resp = await measuredMessage(
      "category",
      client,
      {
        model: CATEGORY_MODEL,
        max_tokens: 500,
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                categoryId: {
                  type: "string",
                  enum: suggestions.map((s) => s.id),
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
                reason: {
                  type: "string",
                },
              },
              required: ["categoryId", "confidence", "reason"],
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
      confidence: result.confidence,
      reason: result.reason,
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
