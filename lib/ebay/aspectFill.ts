import {
  PHOTO_FACT_SCHEMA,
  photoFactProblem,
  type PhotoFact,
} from "@/lib/photo-facts";
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
// Prompt-size bound, applied AFTER priority sorting — required and
// recommended aspects always come first. It was 40, and jewellery categories
// run to 45–53 aspects: earrings lost Theme, Vintage and Signed at the end of
// the list, which the model never saw. 80 covers every category met so far
// and still stops a runaway list from becoming a token bomb.
export const MAX_ASPECTS_TO_FILL = 80;
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

export function aspectPromptLine(a: AspectMeta, current?: string[]): string {
  // An aspect an earlier pass already answered, offered here to be extended.
  // The earlier pass had not seen eBay's list, so what it chose is a start,
  // not the answer; say what is there and ask for the complete set back.
  const already = current?.length
    ? ` — ALREADY CHOSEN: ${current.join(" | ")}. Those were picked before eBay's list was in view and are kept. Your job here is to ADD: work down the supplied list and return every further value that applies. Return nothing for this aspect only if the list holds nothing more that is true of the item.`
    : "";
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
    return `- "${a.name}"${tag}${multi} (must be EXACTLY one of: ${values})${already}`;
  }
  // Free text as eBay's API labels it, but with a vocabulary behind it — and
  // that vocabulary is what buyers filter on, so it is as closed in practice
  // as a menu. Said plainly, and in full, rather than as a dozen hints.
  if (isChoiceSet(a) && !tooLong)
    return `- "${a.name}"${tag}${multi} (must be EXACTLY one of, or omit the aspect: ${a.values.join(" | ")})${already}`;
  const hint = a.values.length
    ? ` (common values: ${a.values.slice(0, 12).join(" | ")})`
    : "";
  return `- "${a.name}"${tag} (free text)${multi}${hint}${already}`;
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
export function allowedValuesFrom(
  raw: unknown,
  a: AspectMeta,
  /** Filled with every word that was not eBay's, so it can be shown. */
  dropped?: string[],
): string[] {
  const synonyms = isColorAspect(a.name) ? COLOR_SYNONYMS : undefined;
  const answers = (Array.isArray(raw) ? raw : [raw]).map((v) =>
    String(v ?? "").trim(),
  );
  const vals: string[] = [];
  const missed: string[] = [];
  const keep = (v: string | null) => {
    if (v && !vals.includes(v)) vals.push(v);
  };
  for (const answer of answers) {
    const whole = cleanAspectValue(answer, a.maxLength);
    const asWhole = whole ? toAllowedValue(whole, a.values, synonyms) : null;
    if (asWhole) {
      keep(asWhole);
      // "Buckle | Pointed Toe" can match whole, as Buckle; the piece that
      // is not eBay's still gets named, rather than vanishing unreported.
      if (answer.includes(" | "))
        for (const piece of answer.split(" | ").map((x) => x.trim()))
          if (piece && !toAllowedValue(piece, a.values, synonyms))
            missed.push(piece);
      continue;
    }
    for (const part of splitAspectValues(answer, a.maxLength)) {
      const found = toAllowedValue(part, a.values, synonyms);
      if (found) keep(found);
      else missed.push(part);
    }
  }
  // The model may have taken a compound value apart for us — ["Hook", "Eye"].
  // Put it back together before giving up.
  if (!vals.length && answers.length > 1)
    for (const sep of ["/", " & ", " / ", ", ", " and "]) {
      const joined = toAllowedValue(answers.join(sep), a.values, synonyms);
      if (joined) return [joined];
    }
  dropped?.push(...missed);
  return vals;
}

/**
 * Whether this pass may add to an aspect the first pass already answered.
 *
 * It may, for a multi-value aspect whose vocabulary eBay published — and it
 * is the only pass that can. The first analysis runs before any category is
 * chosen, so it has never seen eBay's list and answers from its own
 * knowledge: a dress came back "Casual | Shirt Dress | Western", three real
 * Style values and two short of the truth, and because the aspect was no
 * longer empty this pass skipped it entirely. Everything added here still has
 * to be one of eBay's own words, so extending costs nothing and the field
 * stops depending on what the first pass happened to think of.
 *
 * Single-value aspects are never touched: an answer is already there, and
 * replacing it would be overruling the pass that read the label.
 */
export function canExtend(a: AspectMeta, current?: string[]): boolean {
  return (
    a.cardinality === "MULTI" &&
    isChoiceSet(a) &&
    (current?.length ?? 0) > 0 &&
    (current?.length ?? 0) < MAX_MULTI_VALUES
  );
}

/**
 * What this pass actually did, in terms a seller can read.
 *
 * It is written to be best-effort: any failure leaves the aspects untouched
 * and the listing looks perfectly normal. That is right for the listing and
 * wrong for the seller, who cannot tell "the model considered the field and
 * had nothing to add" from "the field was never looked at". Four runs in a
 * row were spent on that question, and neither Vercel's logs on this plan nor
 * the finished screen could answer it.
 */
export interface RefusedWord {
  aspect: string;
  value: string;
  why: string;
}

// The line on screen stays readable; the rest is counted.
const MAX_REFUSED_SHOWN = 15;

export function describeRefused(words: RefusedWord[]): string {
  if (!words.length) return "";
  const shown = words
    .slice(0, MAX_REFUSED_SHOWN)
    .map((w) => `${w.aspect} "${w.value.slice(0, 60)}" — ${w.why}`)
    .join("; ");
  const more = words.length - MAX_REFUSED_SHOWN;
  return `Refused: ${shown}${more > 0 ? `; and ${more} more` : ""}.`;
}

export interface FillReport {
  /** The model was asked and answered. False means it never got that far. */
  ran: boolean;
  /** Photos actually sent. Zero means every photo-grounded fact is refused. */
  photos: number;
  /** Aspects put in front of the model. */
  offered: number;
  /** Aspects past the cap, never shown to the model. Said, not hidden. */
  skipped?: number;
  /** Facts it sent back. */
  returned: number;
  /** Facts refused — not one of eBay's words, or no photo to cite. */
  refused: number;
  /**
   * Each word the model offered that did not go in, and why. A bare count
   * ("11 refused") said something was wrong without saying what.
   */
  refusedWords: RefusedWord[];
  /** Aspects newly filled or extended. */
  added: number;
  changed: string[];
  /** One plain sentence for the screen. */
  note: string;
}

export function describeFill(r: FillReport): string {
  if (!r.ran) return r.note || "did not run";
  const how = r.photos ? `${r.photos} photos` : "no photos — text only";
  const refused = describeRefused(r.refusedWords ?? []);
  const why =
    (refused ? `. ${refused}` : "") +
    (r.skipped ? `. ${r.skipped} fields were not offered to the AI (over the limit of ${MAX_ASPECTS_TO_FILL})` : "");
  if (!r.returned) return `ran (${how}), model proposed nothing`;
  if (!r.added && r.refused === r.returned)
    return `ran (${how}), all ${r.refused} proposals refused${r.photos ? "" : " — with no photos nothing can be cited"}${why}`;
  if (!r.added)
    return `ran (${how}), ${r.returned} proposed, nothing new to add${why}`;
  return `ran (${how}), filled ${r.added}: ${r.changed.join(", ")}${r.refused ? ` (${r.refused} refused)` : ""}${why}`;
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
): Promise<FillReport> {
  const report: FillReport = {
    ran: false,
    photos: 0,
    offered: 0,
    returned: 0,
    refused: 0,
    refusedWords: [],
    added: 0,
    changed: [],
    note: "",
  };
  const byKey = new Map(
    Object.entries(aspects).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const candidates = prioritizeAspects(
    meta.filter(
      (a) =>
        a.name &&
        (!byKey.has(a.name.toLowerCase()) ||
          canExtend(a, byKey.get(a.name.toLowerCase()))),
    ),
  );
  const unfilled = candidates.slice(0, MAX_ASPECTS_TO_FILL);
  report.skipped = candidates.length - unfilled.length;
  if (candidates.length > unfilled.length) {
    console.log(
      `[ebay/publish] aspect-fill sku=${sku}: ${candidates.length - unfilled.length} low-priority aspects skipped (cap ${MAX_ASPECTS_TO_FILL})`,
    );
  }
  report.offered = unfilled.length;
  if (unfilled.length === 0) {
    report.note = "nothing to do — every field eBay asks for was already answered";
    return report;
  }

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
${unfilled.map((a) => aspectPromptLine(a, byKey.get(a.name.toLowerCase()))).join("\n")}

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
- For aspects that allow multiple values, fill them fully. Write every supplied value that honestly describes the item into one value string separated by " | ", up to ${MAX_MULTI_VALUES} of them — not only the single best one. Each value is a separate filter a buyer may be browsing under, and one you leave out is a buyer who never sees the item: a denim shirt dress is Casual and Shirt Dress and Western at once, and naming one of the three hides it from the other two.
- Read eBay's whole supplied list for a multi-value aspect before answering, and ask of each value in turn whether a buyer browsing under it would be satisfied to find this item. Do not stop at the first value that fits; the first two or three that come to mind are rarely all of them. Then stop where the honest answers stop.
- Never add a value to reach a number. eBay's search manipulation policy states that "Using keywords that are not directly related to the item for sale is not allowed" and that a listing breaching it may be removed and the account restricted, so a value that does not describe the item is not a harmless extra — it puts the listing at risk, and it sends a buyer to something they did not want. Filling a field fully and padding it are opposite acts: the first adds values that are true, the second adds values because the field had room. ${MAX_MULTI_VALUES} is a ceiling, never a target, and three true values beat six with two invented among them.
- Information already used in the title, description or another part of the listing should still be included in Item Specifics when it belongs in an eBay aspect.

- UPC: for this seller's listings, use "Does Not Apply" whenever UPC is an available eBay aspect.
- Customized: use "No" whenever Customized is an available eBay aspect.
- Main Stone, Secondary Stone and any other field asking which stone a piece holds — for every kind of jewellery: when the piece has NOTHING set or inset at all (no stone, crystal, rhinestone, glass, pearl, bead or cabochon — only metal), answer eBay's own "No Stone" with basis visible_feature. When something is set, do not name the stone from its look: leave the field for a label or the seller's note.
- Personalize or Personalized: use "No" whenever that aspect is available.
- Signed: when eBay provides a Signed aspect for the category, use "Yes" when the actual item has a visible brand/designer signature, hallmark, stamp or branded maker's mark on the item itself. The brand does not need to be a luxury brand. If the item itself has no such visible signature, hallmark, stamp or maker's mark, use "No". Do not create a Signed aspect for categories where eBay does not provide one.
- Handmade: do not infer Handmade merely from appearance. Use seller-provided information from a photographed note, a readable label/tag, or other reliable evidence establishing whether the item is handmade.
- Vintage and Antique are age-related facts. Do not classify an item as Vintage or Antique merely because its design looks old, retro, Art Deco, Victorian-inspired or vintage-style. Use Vintage or Antique when supported by seller-provided information, readable dating/markings, or other reliable evidence establishing the item's age or period. A vintage-inspired appearance may instead support an appropriate Style or Theme when eBay provides that value.
- Style: what eBay means by Style changes completely from one category to the next, and the list supplied above for this category is its definition — read that list before answering. In clothing, Style is aesthetic, era and mood: Casual, Basic, Chic, Modern, Bohemian, Beach, Cocktail, Formal, Clubwear, Gothic, Nautical, Peasant, Prairie, Pin-Up, Flapper, 50s, 70s. It is never the cut — sleeves belong to Sleeve Type, overall shape to Silhouette, the neck to Neckline, the fastening to Closure and the hem to Dress Length, so a phrase like "puff sleeve button front" is not a Style and belongs in none of them. In jewellery, Style is the form of the piece: Stud, Hoop, Huggie, Dangle/Drop, Chandelier, Climber, Cuff, Tassel for earrings; Choker, Collar, Lariat, Y-Drop, Pendant, Station, Layered, Bib, Locket, Tennis, Charm for necklaces. Style is usually required and usually accepts several values, and it is one of the fields buyers browse most — so give it several. A blue denim shirt dress is Casual, Shirt Dress and Western together, and naming only one of the three hides it from buyers browsing the other two. List every supplied value that honestly describes the item.
- Department: when eBay asks for it, decide it from the item itself — its cut, construction and sizing system — or from the seller's photographed note, which says "men's" or "women's" whenever the photos cannot. A size letter alone (S, M, L) never establishes a department. When neither the item nor the note settles it, omit Department: the app then applies the seller's own default.
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
        // Room for an answer to every one of up to 80 aspects; a cut-off
        // answer is unreadable and loses the whole pass. Billed as used.
        max_tokens: 4000,
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
      report.returned++;
      const said = fact as Partial<PhotoFact>;
      const refuse = (why: string, value = String(said?.value ?? "")) =>
        report.refusedWords.push({
          aspect: a?.name ?? String(said?.name ?? "?"),
          value,
          why,
        });
      // A field this category does not have is refused for that reason
      // first; judging its evidence would only blame the photo.
      if (!a) {
        report.refused++;
        refuse("not a field eBay asks for here");
        continue;
      }
      const problem = photoFactProblem(fact, imageBlocks.length, a);
      if (problem) {
        report.refused++;
        refuse(problem);
        continue;
      }
      const accepted = fact as PhotoFact;
      const raw = accepted.value;
      const existing = aspects[a.name];
      // An aspect already answered is left alone unless it is one this pass
      // may extend — a multi-value field whose list only this pass has seen.
      if (existing?.length && !canExtend(a, existing)) continue;
      let vals: string[];
      // Where eBay published the answers — as a menu, or as "free text" with a
      // vocabulary behind it — the answer is one of them or it is nothing.
      if (a.mode === "SELECTION_ONLY" || isChoiceSet(a)) {
        const missed: string[] = [];
        vals = allowedValuesFrom(raw, a, missed);
        if (!vals.length) {
          // Not eBay's word — the aspect stays empty.
          report.refused++;
          refuse("not an eBay word");
          continue;
        }
        // Some of a multi-value answer was eBay's, some was not.
        for (const word of missed) refuse("not an eBay word", word);
      } else {
        vals = Array.isArray(raw)
          ? raw
              .map((v) => cleanAspectValue(String(v ?? ""), a.maxLength))
              .filter(Boolean)
          : splitAspectValues(raw, a.maxLength);
        if (!vals.length) continue;
      }
      if (a.cardinality === "MULTI") {
        // Union. Nothing an earlier pass established is dropped here — this
        // pass is asked to add, not to re-judge — and every value on both
        // sides has already been held to eBay's own vocabulary.
        const merged = [...(existing ?? [])];
        for (const v of vals) if (!merged.includes(v)) merged.push(v);
        const next = merged.slice(0, MAX_MULTI_VALUES);
        if (next.length === (existing?.length ?? 0)) continue; // nothing gained
        aspects[a.name] = next;
      } else {
        aspects[a.name] = vals.slice(0, 1);
      }
      listing.evidence = { ...listing.evidence, [a.name]: accepted.photoIndices };
      if (!report.changed.includes(a.name)) report.changed.push(a.name);
      added++;
    }
    report.ran = true;
    report.photos = imageBlocks.length;
    report.added = added;
    report.note = describeFill(report);
    if (added) {
      console.log(
        `[ebay/publish] aspect-fill added ${added} specifics sku=${sku}` +
          (imageBlocks.length
            ? ` (vision, ${imageBlocks.length} photos)`
            : " (text-only)"),
      );
    }
  } catch (e) {
    const why = (e as Error).message || "unknown error";
    report.note = /timed out|timeout|deadline|abort/i.test(why)
      ? `did not finish in time (${why})`
      : `failed: ${why}`;
    console.warn(
      `[ebay/publish] aspect-fill skipped sku=${sku}: ${why}`,
    );
  }
  return report;
}
