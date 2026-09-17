import { acceptedPhotoFact, PHOTO_FACT_SCHEMA } from "@/lib/photo-facts";
import { remainingTime } from "@/lib/network";
import { measuredMessage } from "@/lib/ai-usage";
// Category-aware, photo-grounded item-specifics fill.
//
// The initial analysis model writes generic specifics without knowing which
// aspects the final eBay leaf category actually wants. At publish time we know
// the exact leaf category and its full aspect schema — AND we have the original
// photos in hand (they're uploaded to eBay in the same request). So this pass
// re-examines the photos against eBay's real aspect names and allowed values,
// instead of the old text-only call that could never recover anything the
// first pass missed (model numbers, fabric contents, necklines, hallmarks…).
//
// Aspects are prioritized required → recommended → optional, replacing the old
// arbitrary "first 25 in taxonomy order" cap.
//
// Strictly best-effort: any failure leaves the aspects untouched.

import { getClient, parseModelJson } from "@/lib/anthropic";
import { toImageBlock, urlImageBlock, type WireImage } from "@/lib/images";
import type { ListingResult } from "@/lib/types";
import type { AspectMeta } from "./taxonomy";
import {
  cleanAspectValue,
  matchAllowed,
  splitAspectValues,
  MAX_MULTI_VALUES,
} from "./aspects";

const FILL_MODEL = "claude-sonnet-4-6";
// Prompt-size bound, applied AFTER priority sorting — a category with 60
// aspects fills its required + recommended ones first, never junk-first.
const MAX_ASPECTS_TO_FILL = 40;
const MAX_ALLOWED_VALUES_SHOWN = 40;
// Vision costs scale with image count; 8 photos cover tags + details for
// nearly every item while keeping the call cheap (~1–3¢).
const MAX_FILL_IMAGES = 24;

const USAGE_RANK = { REQUIRED: 0, RECOMMENDED: 1, OPTIONAL: 2 } as const;

export function prioritizeAspects(unfilled: AspectMeta[]): AspectMeta[] {
  return [...unfilled].sort(
    (a, b) => (USAGE_RANK[a.usage] ?? 2) - (USAGE_RANK[b.usage] ?? 2),
  );
}

function aspectPromptLine(a: AspectMeta): string {
  const tag =
    a.usage === "REQUIRED"
      ? " [required]"
      : a.usage === "RECOMMENDED"
        ? " [recommended]"
        : "";
  const multi =
    a.cardinality === "MULTI"
      ? " (multiple values allowed — return an array)"
      : "";
  if (a.mode === "SELECTION_ONLY" && a.values.length) {
    const values =
      a.values.length <= MAX_ALLOWED_VALUES_SHOWN
        ? a.values.join(" | ")
        : "(large list: return only the exact value visible in the evidence; it will be validated)";
    return `- "${a.name}"${tag}${multi} (must be EXACTLY one of: ${values})`;
  }
  const hint = a.values.length
    ? ` (common values: ${a.values.slice(0, 12).join(" | ")})`
    : "";
  return `- "${a.name}"${tag} (free text)${multi}${hint}`;
}

export async function fillRecommendedAspects(
  listing: ListingResult,
  aspects: Record<string, string[]>,
  meta: AspectMeta[],
  sku: string,
  images: WireImage[] = [],
  // When the client pre-uploaded photos to eBay (batched to dodge Vercel's
  // body limit), the publish request has no base64 in hand — the vision pass
  // reads the eBay-hosted URLs instead, so photo grounding survives.
  imageUrls: string[] = [],
): Promise<void> {
  const have = new Set(Object.keys(aspects).map((k) => k.toLowerCase()));
  const candidates = prioritizeAspects(
    meta.filter((a) => a.name && !have.has(a.name.toLowerCase())),
  );
  const unfilled = candidates.slice(0, MAX_ASPECTS_TO_FILL);
  if (candidates.length > unfilled.length) {
    console.log(
      `[ebay/publish] aspect-fill sku=${sku}: ${candidates.length - unfilled.length} low-priority aspects skipped (cap ${MAX_ASPECTS_TO_FILL})`,
    );
  }
  if (unfilled.length === 0) return;

  // Bound every embedded field — a runaway model output stored in the listing
  // must not turn this prompt into a token bomb.
  const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const itemData = {
    title: clip(listing.title, 120),
    brand: clip(listing.brand, 80),
    item_type: clip(listing.item_type, 80),
    color: (Array.isArray(listing.color) ? listing.color : [listing.color])
      .filter(Boolean)
      .slice(0, 4)
      .map((c) => clip(c, 40)),
    size: clip(listing.size, 40),
    material: clip(listing.material, 80),
    measurements: clip(listing.measurements, 200),
    key_features: (listing.key_features ?? [])
      .slice(0, 5)
      .map((f) => clip(f, 100)),
    item_specifics: Object.fromEntries(
      Object.entries(listing.item_specifics ?? {})
        .slice(0, 40)
        .map(([k, v]) => [clip(k, 60), clip(v, 120)]),
    ),
    description: clip(listing.description, 900),
  };

  const imageBlocks = (
    images.length
      ? images.slice(0, MAX_FILL_IMAGES).map(toImageBlock)
      : imageUrls.slice(0, MAX_FILL_IMAGES).map(urlImageBlock)
  ).filter((b): b is NonNullable<ReturnType<typeof toImageBlock>> =>
    Boolean(b),
  );

  const prompt = `You are completing eBay item specifics for a draft awaiting seller review.
${imageBlocks.length ? "The photos above show the actual item. Inspect every photo again — tags, labels, stamps, close-ups — for evidence." : ""}
ITEM DATA (from earlier photo analysis):
${JSON.stringify(itemData, null, 1)}

EBAY WANTS VALUES FOR THESE ASPECTS (exact aspect names for this category):
${unfilled.map(aspectPromptLine).join("\n")}

Rules:
- Your goal is to complete as many applicable eBay item specifics as possible for this exact category while maintaining high factual accuracy.
- Use reliable evidence from ALL supplied photos. Reliable evidence includes the actual item and its objectively visible characteristics; readable labels, tags, hallmarks, stamps, signatures and maker's marks; visible measurements; and seller-provided information written on a photographed note.
- A photographed seller note is valid seller-provided evidence. It may provide measurements or facts such as Handmade, Vintage, Antique, material, size, age or other information that cannot necessarily be determined from appearance alone.
- Examine all photos carefully before filling the aspects. Do not stop after finding enough information for the required fields.
- Consider REQUIRED, RECOMMENDED and OPTIONAL eBay aspects. Fill every applicable aspect that can be supported by reliable evidence or confidently identified from the actual item.
- Characteristics that are objectively visible may be identified directly from the item. This includes, when applicable to the category, Color, Shape, Closure, Style, Pattern, Type, design or construction characteristics, visible Features, stone shape, and other characteristics that a knowledgeable seller can reliably identify by examining the item.
- These rules apply across all product categories, not only jewelry. Use only the aspects supplied by eBay for the item's exact category.
- Use ONLY the supplied eBay aspect names as keys, spelled exactly as given.
- When eBay provides allowed values for an aspect, use the exact supplied eBay value whenever one accurately describes the item. Do not invent a different term when an appropriate eBay value is available.
- For "must be EXACTLY one of" aspects, copy the applicable value verbatim from the supplied list.
- For aspects that allow multiple values, return a JSON array and include all values that genuinely and usefully apply to the item. Do not select irrelevant values merely to increase the number of filled fields.
- Information already used in the title, description or another part of the listing should still be included in Item Specifics when it belongs in an eBay aspect.

- UPC: for this seller's listings, use "Does Not Apply" whenever UPC is an available eBay aspect.
- Customized: use "No" whenever Customized is an available eBay aspect.
- Personalize or Personalized: use "No" whenever that aspect is available.
- Signed: when eBay provides a Signed aspect for the category, use "Yes" when the actual item has a visible brand/designer signature, hallmark, stamp or branded maker's mark on the item itself. The brand does not need to be a luxury brand. If the item itself has no such visible signature, hallmark, stamp or maker's mark, use "No". Do not create a Signed aspect for categories where eBay does not provide one.
- Handmade: do not infer Handmade merely from appearance. Use seller-provided information from a photographed note, a readable label/tag, or other reliable evidence establishing whether the item is handmade.
- Vintage and Antique are age-related facts. Do not classify an item as Vintage or Antique merely because its design looks old, retro, Art Deco, Victorian-inspired or vintage-style. Use Vintage or Antique when supported by seller-provided information, readable dating/markings, or other reliable evidence establishing the item's age or period. A vintage-inspired appearance may instead support an appropriate Style or Theme when eBay provides that value.
- Features: actively evaluate all Features offered by eBay for the category. Select every offered feature that is reliably visible on the item or established by seller-provided information. Visible construction and functionality may be used as evidence for Features.
- Theme: actively evaluate the Theme values supplied by eBay. Select the theme or themes that genuinely correspond to the item's visible design, motif, imagery, aesthetic or other reliable characteristics. Multiple themes may be selected when eBay allows multiple values and each selected theme genuinely applies. Do not add unrelated themes merely to fill the field.
- Occasion: actively evaluate the Occasion values supplied by eBay. Select reasonable occasions for which the item is genuinely appropriate. Multiple occasions may be selected when eBay permits multiple values. Do not automatically select every available occasion.
- Measurements shown on a photographed seller note are valid seller-provided measurements and should be used for the corresponding eBay aspects when applicable.

- Never use placeholder text such as "See photos", "Unknown" or "N/A". Omit an unsupported aspect instead, except for UPC where the seller rule above requires "Does Not Apply".
- Values must be short and comply with the eBay aspect requirements.

MANDATORY VERIFICATION BEFORE RETURNING THE RESULT:
- Before returning the final facts, perform a second verification pass over every aspect you intend to fill.
- Re-check the photos and reliable evidence for every proposed value.
- Confirm that each value belongs to the correct eBay aspect.
- Confirm that you correctly read any label, hallmark, stamp, measurement or seller-provided photographed note used as evidence.
- When eBay supplied allowed values, confirm that the final value exactly matches an allowed eBay value where required.
- Distinguish facts from guesses. Never turn an unsupported assumption into a factual item specific.
- After verifying accuracy, perform one final completeness check against the supplied eBay aspect list. Make sure you have not omitted an applicable aspect that the available reliable evidence allows you to fill confidently.
- The verification pass must improve accuracy without becoming unnecessarily conservative: the goal is a thorough, highly complete set of accurate Item Specifics, not the smallest possible set.

Return {"facts":[{"name":"Material","value":"Cashmere","basis":"label","quote":"100% CASHMERE","photoIndices":[2]}]}. For a directly visible construction feature use basis visible_feature and an empty quote. Photo indices are 1-based. Label-derived facts require exact quoted text. Omit everything unknown; return {"facts":[]} if necessary`;

  try {
    const client = getClient();
    const resp = await measuredMessage(
      "specifics",
      client,
      {
        model: FILL_MODEL,
        max_tokens: 2200,
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                facts: { type: "array", items: PHOTO_FACT_SCHEMA },
              },
              required: ["facts"],
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [...imageBlocks, { type: "text", text: prompt }],
          },
        ],
      },
      { timeout: remainingTime(60_000), maxRetries: 0 },
    );
    const block = resp.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const filled = parseModelJson<{ facts?: unknown[] }>(text);

    const byLower = new Map(unfilled.map((a) => [a.name.toLowerCase(), a]));
    let added = 0;
    for (const fact of filled.facts ?? []) {
      if (!acceptedPhotoFact(fact, imageBlocks.length)) continue;
      const key = fact.name,
        raw = fact.value;
      const a = byLower.get(String(key).toLowerCase());
      if (!a || aspects[a.name]) continue;
      const parts = Array.isArray(raw)
        ? raw
            .map((v) => cleanAspectValue(String(v ?? ""), a.maxLength))
            .filter(Boolean)
        : splitAspectValues(raw, a.maxLength);
      if (!parts.length) continue;
      let vals: string[];
      if (a.mode === "SELECTION_ONLY") {
        vals = [];
        for (const p of parts) {
          const canonical = matchAllowed(p, a.values);
          if (canonical && !vals.includes(canonical)) vals.push(canonical);
        }
        // Splitting may have broken a compound allowed value apart — rejoin.
        if (!vals.length && parts.length > 1) {
          for (const sep of [" & ", " / ", ", ", " and "]) {
            const joined = matchAllowed(parts.join(sep), a.values);
            if (joined) {
              vals = [joined];
              break;
            }
          }
        }
        if (!vals.length) continue; // invalid selection — safer to leave empty
      } else {
        vals = parts;
      }
      aspects[a.name] =
        a.cardinality === "MULTI"
          ? vals.slice(0, MAX_MULTI_VALUES)
          : vals.slice(0, 1);
      listing.evidence = { ...listing.evidence, [a.name]: fact.photoIndices };
      added++;
    }
    if (added) {
      console.log(
        `[ebay/publish] aspect-fill added ${added} specifics sku=${sku}` +
          (imageBlocks.length
            ? ` (vision, ${imageBlocks.length} photos)`
            : " (text-only)"),
      );
    }
  } catch (e) {
    console.warn(
      `[ebay/publish] aspect-fill skipped sku=${sku}: ${(e as Error).message}`,
    );
  }
}
