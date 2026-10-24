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
  isChoiceSet,
  isColorAspect,
  matchAllowed,
  splitAspectValues,
  toAllowedValue,
  COLOR_SYNONYMS,
  MAX_MULTI_VALUES,
} from "./aspects";

const FILL_MODEL = "claude-sonnet-4-6";
// Prompt-size bound, applied AFTER priority sorting — a category with 60
// aspects fills its required + recommended ones first, never junk-first.
const MAX_ASPECTS_TO_FILL = 40;
// Spell a vocabulary out in full up to this length. eBay's Style list for
// dresses runs to 63 words, and the useful ones — Basic, Bohemian, Casual,
// Chic, Prairie — sit past the first dozen alphabetically, behind 40s, 50s,
// 60s, 70s, Anarkali, Anime, Art Deco. Showing twelve of them and calling
// them "common values" is what made the model write a phrase of its own.
//
// Above this length a list has stopped being a vocabulary and become a
// catalogue: 4,523 dress brands, 244 countries, 186 licensed characters.
// Those are looked up from what is in front of you, not learned.
const MAX_ALLOWED_VALUES_SHOWN = 150;
// Vision costs scale with image count; 8 photos cover tags + details for
// nearly every item while keeping the call cheap (~1–3¢).
const MAX_FILL_IMAGES = 24;

const USAGE_RANK = { REQUIRED: 0, RECOMMENDED: 1, OPTIONAL: 2 } as const;

export function prioritizeAspects(unfilled: AspectMeta[]): AspectMeta[] {
  return [...unfilled].sort(
    (a, b) => (USAGE_RANK[a.usage] ?? 2) - (USAGE_RANK[b.usage] ?? 2),
  );
}

export function aspectPromptLine(a: AspectMeta): string {
  const tag =
    a.usage === "REQUIRED"
      ? " [required]"
      : a.usage === "RECOMMENDED"
        ? " [recommended]"
        : "";
  // Not "return an array": the output schema declares value as a string, so
  // an array is not something the model is able to send. Asked for one, it
  // sent a single value instead, and every MULTI aspect — Features, Style,
  // Theme, Occasion, Season, Accents — quietly went out with one word.
  const multi =
    a.cardinality === "MULTI"
      ? ` (up to ${MAX_MULTI_VALUES} values — put every one that applies in the single value string, separated by " | ")`
      : "";
  const tooLong = a.values.length > MAX_ALLOWED_VALUES_SHOWN;
  if (a.mode === "SELECTION_ONLY" && a.values.length) {
    const values = tooLong
      ? "(large list: return only the exact value visible in the evidence; it will be validated)"
      : a.values.join(" | ");
    return `- "${a.name}"${tag}${multi} (must be EXACTLY one of: ${values})`;
  }
  // Free text as eBay's API labels it, but with a vocabulary behind it — and
  // that vocabulary is what buyers filter on, so it is as closed in practice
  // as a menu. Said plainly, and in full, rather than as a dozen hints.
  if (isChoiceSet(a) && !tooLong)
    return `- "${a.name}"${tag}${multi} (must be EXACTLY one of, or omit the aspect: ${a.values.join(" | ")})`;
  const hint = a.values.length
    ? ` (common values: ${a.values.slice(0, 12).join(" | ")})`
    : "";
  return `- "${a.name}"${tag} (free text)${multi}${hint}`;
}

/**
 * eBay's own values for a model-provided answer, and nothing else.
 *
 * Each answer is tried WHOLE before it is taken apart, because eBay's
 * vocabularies are full of values that contain the very characters a split
 * runs on: "Dangle/Drop" for earrings, "Hook & Eye" for a dress closure,
 * "Trapeze & Swing" for a dress style, "Animals & Insects" and "Letters,
 * Numbers & Words" for a theme. Split first and each becomes two words eBay
 * has never heard of, and the aspect goes out empty.
 *
 * Splitting still happens after that, because a multi-value aspect arrives as
 * one string — the model cannot return an array through the output schema, so
 * it is asked for "Collared | Pockets" instead.
 */
export function allowedValuesFrom(raw: unknown, a: AspectMeta): string[] {
  const synonyms = isColorAspect(a.name) ? COLOR_SYNONYMS : undefined;
  const answers = (Array.isArray(raw) ? raw : [raw]).map((v) =>
    String(v ?? "").trim(),
  );
  const vals: string[] = [];
  const keep = (v: string | null) => {
    if (v && !vals.includes(v)) vals.push(v);
  };
  for (const answer of answers) {
    const whole = cleanAspectValue(answer, a.maxLength);
    const asWhole = whole ? toAllowedValue(whole, a.values, synonyms) : null;
    if (asWhole) {
      keep(asWhole);
      continue;
    }
    for (const part of splitAspectValues(answer, a.maxLength))
      keep(toAllowedValue(part, a.values, synonyms));
  }
  // The model may have taken a compound value apart for us — ["Hook", "Eye"].
  // Put it back together before giving up.
  if (!vals.length && answers.length > 1)
    for (const sep of ["/", " & ", " / ", ", ", " and "]) {
      const joined = toAllowedValue(answers.join(sep), a.values, synonyms);
      if (joined) return [joined];
    }
  return vals;
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
- For "must be EXACTLY one of" aspects, copy the applicable value verbatim from the supplied list. A value you write yourself will be discarded, even when it is a true description of the item: these words are the words buyers filter and search on, and a word eBay does not publish matches nothing. Where no supplied value honestly fits, omit the aspect.
- For aspects that allow multiple values, fill them generously. Write every supplied value that honestly describes the item into one value string separated by " | ", up to ${MAX_MULTI_VALUES} of them — not only the single best one. Each is a separate filter a buyer may be browsing under, and a value you leave out is a buyer who never sees the item. A denim shirt dress is Casual and Western and Classic at once, and listing one of the three hides it from the other two. The bar is honesty, not caution: include a value when a buyer who searched for it would be satisfied to find this item, and leave out only what is plainly untrue of it.
- Information already used in the title, description or another part of the listing should still be included in Item Specifics when it belongs in an eBay aspect.

- UPC: for this seller's listings, use "Does Not Apply" whenever UPC is an available eBay aspect.
- Customized: use "No" whenever Customized is an available eBay aspect.
- Personalize or Personalized: use "No" whenever that aspect is available.
- Signed: when eBay provides a Signed aspect for the category, use "Yes" when the actual item has a visible brand/designer signature, hallmark, stamp or branded maker's mark on the item itself. The brand does not need to be a luxury brand. If the item itself has no such visible signature, hallmark, stamp or maker's mark, use "No". Do not create a Signed aspect for categories where eBay does not provide one.
- Handmade: do not infer Handmade merely from appearance. Use seller-provided information from a photographed note, a readable label/tag, or other reliable evidence establishing whether the item is handmade.
- Vintage and Antique are age-related facts. Do not classify an item as Vintage or Antique merely because its design looks old, retro, Art Deco, Victorian-inspired or vintage-style. Use Vintage or Antique when supported by seller-provided information, readable dating/markings, or other reliable evidence establishing the item's age or period. A vintage-inspired appearance may instead support an appropriate Style or Theme when eBay provides that value.
- Style: what eBay means by Style changes completely from one category to the next, and the list supplied above for this category is its definition — read that list before answering. In clothing, Style is aesthetic, era and mood: Casual, Basic, Chic, Modern, Bohemian, Beach, Cocktail, Formal, Clubwear, Gothic, Nautical, Peasant, Prairie, Pin-Up, Flapper, 50s, 70s. It is never the cut — sleeves belong to Sleeve Type, overall shape to Silhouette, the neck to Neckline, the fastening to Closure and the hem to Dress Length, so a phrase like "puff sleeve button front" is not a Style and belongs in none of them. In jewellery, Style is the form of the piece: Stud, Hoop, Huggie, Dangle/Drop, Chandelier, Climber, Cuff, Tassel for earrings; Choker, Collar, Lariat, Y-Drop, Pendant, Station, Layered, Bib, Locket, Tennis, Charm for necklaces. Style is usually required and usually accepts several values, and it is one of the fields buyers browse most — so give it several. A blue denim shirt dress is Casual, Shirt Dress and Western together, and naming only one of the three hides it from buyers browsing the other two. List every supplied value that honestly describes the item.
- Features: actively evaluate all Features offered by eBay for the category and select every one that is reliably visible on the item or established by seller-provided information — this field is a list, not a single answer, and a dress with pockets and a collar is Pockets AND Collared, never one of the two. Visible construction and functionality may be used as evidence for Features. Work down eBay's whole list before answering rather than stopping at the first value that fits.
- Theme: actively evaluate the Theme values supplied by eBay against the item's design, motif, imagery and overall aesthetic, and select every one that honestly fits — eBay's Theme list mixes pictorial motifs (Butterfly, Skull, Flower, Horse) with aesthetics (Classic, Retro, Preppy, Grunge, Hippie, Bohemian, Western), and a garment with no print can still carry an aesthetic. Several themes are normal and wanted. Leave Theme empty only when nothing on the list fits; what must not happen is a motif that is not there — no Flower on a plain dress.
- Occasion: when eBay supplies an Occasion aspect for the category, fill it. Nearly every garment has at least one occasion it is genuinely worn for, and Casual is the honest answer for ordinary daywear — jeans, tees, sweatshirts, denim and jersey dresses — not a filler. Evening fabrics, beading and sequins are Party/Cocktail or Formal; tailoring, blazers and sheath dresses are Business or Workwear. Select every occasion that genuinely applies where eBay permits multiple values, and do not select every available one. Leave it empty only when the item is not clothing or nothing about it suggests any occasion.
- Material and Fabric Type are different questions and eBay asks both. Material is fibre content — Cotton, Linen, Silk, Wool, Polyester — and comes from a care tag, a label or the seller's note, never from the look of the cloth. Fabric Type is weave and construction — Denim, Corduroy, Lace, Velvet, Tweed, Jersey, Knit — which a photograph shows plainly. Put denim under Fabric Type, not Material. Where telling one fabric from another depends on fibre content rather than construction, such as rayon against viscose or microfibre, leave Fabric Type to the care tag.
- Season: when eBay supplies a Season aspect, it asks when the garment is worn, which follows from its weight, coverage and fabric and not from taste. Sleeveless and short-sleeve garments in linen, light cotton, chambray, lightweight denim or jersey are Summer. Heavy wool, thick knits, fleece, and quilted or lined outerwear are Winter. Long-sleeve garments in mid-weight fabric, light jackets and transitional layers are Spring and Fall. Choose the season the garment is actually made for; add a second season only when it suits that one just as well. Leave Season empty for a garment worn year round, or where nothing about it points to a season.
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
      // Look the aspect up first: whether a seen-in-the-photo fact is accepted
      // depends on whether eBay offers a closed list of answers for it.
      const a = byLower.get(
        String((fact as { name?: unknown })?.name ?? "").toLowerCase(),
      );
      if (!acceptedPhotoFact(fact, imageBlocks.length, a)) continue;
      const raw = fact.value;
      if (!a || aspects[a.name]) continue;
      let vals: string[];
      // Where eBay published the answers — as a menu, or as "free text" with a
      // vocabulary behind it — the answer is one of them or it is nothing.
      if (a.mode === "SELECTION_ONLY" || isChoiceSet(a)) {
        vals = allowedValuesFrom(raw, a);
        if (!vals.length) continue; // not eBay's word — leave the aspect empty
      } else {
        vals = Array.isArray(raw)
          ? raw
              .map((v) => cleanAspectValue(String(v ?? ""), a.maxLength))
              .filter(Boolean)
          : splitAspectValues(raw, a.maxLength);
        if (!vals.length) continue;
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
