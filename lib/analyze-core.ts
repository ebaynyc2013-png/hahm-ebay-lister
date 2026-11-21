import { scrubContactInfo } from "@/lib/contact-info";
import { applyMakerMarkRules } from "@/lib/maker-marks";
import { letterOnly, letterOnlyInDescription } from "@/lib/letter-size";
import { referenceBlocks, referencesSchema } from "@/lib/brand-references";
import { lessonBlocks, lessonsSchema } from "@/lib/tag-lessons";
import { phraseBlocks, phrasesSchema } from "@/lib/style-phrase-blocks";
import { formatDescription } from "@/lib/description-format";
import { cleanEtsyTags, cleanHashtags, tagEvidence } from "@/lib/marketplace-tags";
import { isAestheticHashtag } from "@/lib/aesthetics";
import { acceptedPhotoFact } from "@/lib/photo-facts";
import { notesSupport } from "@/lib/note-facts";
import { sellerNotesBlocks } from "@/lib/seller-notes";
import { cleanDoubts } from "@/lib/listing-mismatch";
import {
  isStatement,
  statementApplies,
  statementFromAnalysis,
  statementOutOfTitle,
  statementTags,
  withoutStatementStyle,
} from "@/lib/statement";
import { AI_LISTING_SCHEMA } from "@/lib/ai-schema";
import { boundModelAnswer, parseDraftListing, imagesSchema, routerImagesSchema } from "@/lib/validation";
import { measuredMessage } from "@/lib/ai-usage";
import type Anthropic from "@anthropic-ai/sdk";
import { getClient, parseModelJson, anthropicAuthError } from "@/lib/anthropic";
import { resolveModel } from "@/lib/models";
import {
  PROFILE_ROUTER_PROMPT,
  buildProfiledAnalysisPrompt,
  normalizeItemProfile,
} from "@/lib/prompts";
import { toImageBlock, type ImageBlock } from "@/lib/images";
import { optimizeTitle } from "@/lib/titleOptimizer";
import { foreignSizeInDescription, italianSizeFix } from "@/lib/foreign-size";
import { ringSizeInDescription, ringSizeInTitle } from "@/lib/ring-size";
import { otherSizeInDescription, otherSizeInTitle } from "@/lib/size-conversions";
import { shoeSizeInDescription } from "@/lib/title-shoe-size";
import { fitTitle } from "@/lib/title-fit";
import { vintageFromAnalysis, vintageTitle } from "@/lib/vintage";
import { excellentWithoutFlaw, tidyConditionNotes } from "@/lib/condition-sync";
import { fixDetailPlaces } from "@/lib/detail-places";
import { applyPriceMarkup, priceMarkupPercent } from "@/lib/pricing";
import type { AnalyzeRequestBody, ListingResult } from "@/lib/types";
import { sellerRulesSchema } from "@/lib/learn-diff";
import { WRITING_RULES_INTRO, sellerRulesText } from "@/lib/learn";

/**
 * Writing a listing from photos, in two halves shared by "now" (the analyze
 * route) and "by morning" (the cheap queue, 18 Nov 2026): the request the AI
 * gets, and everything the program does with its answer. Both ways write the
 * same listing by the same rules.
 */

export const ANALYSIS_MODEL = "claude-opus-4-8";
export const ROUTER_MODEL = "claude-sonnet-4-6";
export const MAX_IMAGES = 24;
// Per-call cap for the first step; SDK-internal retries stay off.
export const ROUTER_TIMEOUT_MS = 20_000;
// Don't bother starting a call with less budget than this left.
export const MIN_CALL_MS = 5_000;

export function toImageBlocks(images: AnalyzeRequestBody["images"]): ImageBlock[] {
  const blocks: ImageBlock[] = [];
  for (const img of images.slice(0, MAX_IMAGES)) {
    const block = toImageBlock(img);
    if (block) blocks.push(block);
  }
  return blocks;
}

// Mirrors route_item_profile(): honor a forced profile, else ask the model.
// Falls back to hard_goods when the router can't run (error or budget spent) —
// same fallback the catch below has always used.
export async function routeProfile(
  client: Anthropic,
  imageBlocks: ImageBlock[],
  requested: string,
  routerModel: string,
  deadline: number,
): Promise<string> {
  const forced = normalizeItemProfile(requested);
  if (forced !== "auto") return forced;

  const remaining = deadline - Date.now();
  if (remaining < MIN_CALL_MS) return "hard_goods";

  try {
    const resp = await measuredMessage(
      "routing",
      client,
      {
        model: routerModel,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              { type: "text", text: PROFILE_ROUTER_PROMPT },
            ],
          },
        ],
      },
      { timeout: Math.min(ROUTER_TIMEOUT_MS, remaining), maxRetries: 0 },
    );
    const text = firstText(resp);
    const data = parseModelJson<{ profile?: string }>(text);
    const routed = normalizeItemProfile(data?.profile ?? "auto");
    return routed !== "auto" ? routed : "hard_goods";
  } catch (e) {
    // Auth/billing failures must surface, not silently fall back to a profile.
    const fatal = anthropicAuthError(e);
    if (fatal) throw fatal;
    return "hard_goods";
  }
}

export function firstText(resp: Anthropic.Message): string {
  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}

/** The request body, checked; throws on a body that cannot be used. */
export function readAnalyzeBody(raw: unknown): AnalyzeRequestBody {
  const body = raw as AnalyzeRequestBody;
  imagesSchema.parse(body.images);
  // Marks the seller confirmed before: optional, and never allowed to sink
  // the request — a malformed set is simply left out.
  const refs = referencesSchema.safeParse(body.references ?? []);
  body.references = refs.success ? refs.data : [];
  // The seller's tag corrections: the same — optional, never fatal.
  const lessons = lessonsSchema.safeParse(body.lessons ?? []);
  body.lessons = lessons.success ? lessons.data : [];
  // The seller's phrases for the opening sentence: optional, never fatal.
  const phrases = phrasesSchema.safeParse(body.phrases ?? []);
  body.phrases = phrases.success ? phrases.data : [];
  // The small copies for the first step: optional, never fatal.
  const small = routerImagesSchema.safeParse(body.routerImages ?? []);
  body.routerImages = small.success ? small.data : [];
  // What she typed in the item's Notes box: optional, never fatal.
  body.sellerNotes =
    typeof body.sellerNotes === "string" ? body.sellerNotes.trim().slice(0, 2000) : "";
  // Rules learned from her corrections: optional, never fatal (18 Nov 2026).
  const rules = sellerRulesSchema.safeParse(body.sellerRules ?? []);
  body.sellerRules = rules.success ? rules.data : [];
  return body;
}

/** What the AI is asked: the rules for this kind of item, the photos, her notes. */
export function buildAnalysisParams(
  body: AnalyzeRequestBody,
  profile: string,
  analysisModel: string,
  imageBlocks: ImageBlock[],
): Anthropic.MessageCreateParamsNonStreaming {
  const systemPrompt = buildProfiledAnalysisPrompt(profile);
  return {
    model: analysisModel,
    max_tokens: 5000,
    output_config: {
      format: { type: "json_schema", schema: AI_LISTING_SCHEMA },
    },
    // System prompt is large and identical across requests for the same
    // profile — cache it to cut cost and latency. Five minutes, renewed
    // by every listing that reads it: the seller writes items a few
    // minutes apart, so the rules stay cached; a 1-hour cache would cost
    // more for a lone item (2× write instead of 1.25×). Tried 10 Nov,
    // dropped 11 Nov 2026 at the seller's choice.
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          // After the item's photos, so photo numbers stay the item's.
          ...referenceBlocks(body.references),
          ...lessonBlocks(body.lessons),
          ...phraseBlocks(body.phrases),
          ...sellerNotesBlocks(body.sellerNotes),
          ...sellerRuleBlocks(body.sellerRules),
          {
            type: "text",
            text: "Analyze these photos and return the listing JSON now.",
          },
        ],
      },
    ],
  };
}

/** Her learned rules as a block of the request, when she has any. */
function sellerRuleBlocks(rules: AnalyzeRequestBody["sellerRules"]): { type: "text"; text: string }[] {
  const text = sellerRulesText(rules ?? [], WRITING_RULES_INTRO);
  return text ? [{ type: "text", text }] : [];
}

/** What the finished listing needs to know about the request it came from. */
export interface FinishContext {
  imageCount: number;
  sellerNotes?: string;
  /** The ids of her phrases the AI was offered. */
  phraseIds: string[];
  profile: string;
}

/** The AI's answer (its JSON text) made into the listing the card shows. */
export function finishListing(text: string, ctx: FinishContext): ListingResult {
  // Fitted before it is checked: one search phrase or one title word too
  // many must never fail a listing she has already paid for (21 Nov 2026).
  // The title may be long here; it is shortened to 80 by whole words below,
  // after the program has finished shaping it.
  const raw = boundModelAnswer(parseModelJson<Record<string, unknown>>(text));
  const specifics = Array.isArray(raw.specifics) ? raw.specifics : [];
  // A fact from her typed notes has no photo to cite; her own words
  // are its check (12 Nov 2026).
  const supported = specifics.filter(
    (s) =>
      acceptedPhotoFact(s, ctx.imageCount) ||
      notesSupport(s as { value?: unknown; quote?: unknown }, ctx.sellerNotes),
  );
  const listing = parseDraftListing({
    ...raw,
    vintage: vintageFromAnalysis(raw.vintage),
    statement: statementFromAnalysis(raw.statement),
    item_specifics: Object.fromEntries(
      supported.map((s: any) => [s.name, s.value]),
    ),
  });
  // A bare number on an Italian label is an Italian size (Prada 36 is
  // IT 36 = US 0, XS — 1 Nov 2026), before the size is converted.
  italianSizeFix(listing, listing.item_specifics?.Size);
  // Where a detail is: from the photos it is seen on (1 Nov 2026).
  fixDetailPlaces(listing, raw.photo_views, raw.detail_places);
  // A grade below Excellent with no flaw named in the notes is
  // Excellent — the seller's rule (31 Oct 2026); the notes' first line
  // and the description's Condition line follow.
  excellentWithoutFlaw(listing);
  listing.condition_notes = tidyConditionNotes(listing.condition_notes, listing.condition);
  // "vintage 90s" on her note: Vintage Yes now, the era's Theme and
  // Style at Prepare (eBay's lists), and the title opening with it.
  if (listing.vintage?.source === "note")
    listing.item_specifics = { ...listing.item_specifics, Vintage: "Yes" };
  listing.item_profile = ctx.profile;
  // Kept with the listing: the eBay pass and "Update with notes" read
  // the same words (12 Nov 2026).
  if (ctx.sellerNotes) listing.seller_notes = ctx.sellerNotes;
  listing.doubts = cleanDoubts(listing.doubts);
  listing.evidence = Object.fromEntries(
    supported.map((s: any) => [s.name, s.photoIndices]),
  );
  // A piece with a maker's mark is never "Unbranded"; a brand taken
  // from a known mark waits for the seller's confirmation.
  applyMakerMarkRules(listing);
  // No contact details in anything that publishes; whatever had to be
  // taken out is told to the seller beside what the model saw.
  const removed = scrubContactInfo(listing);
  listing.contact_seen = [
    ...(listing.contact_seen ?? []),
    ...removed.map((r) => `"${r}" was in the text — taken out`),
  ];
  // Deterministic title cleanup happens HERE, before the seller reviews —
  // the title on the card is exactly the title that publishes.
  listing.title = optimizeTitle(listing);
  // The prompt already puts "Vintage 90s" first; this is the guarantee,
  // without rewriting an era she wrote her own way.
  if (listing.vintage?.source === "note" && !/^vintage\b/i.test(listing.title))
    listing.title = vintageTitle(listing.title, listing.vintage.era, listing);
  // Statement pieces (the seller, 15 Nov 2026): the word is never in a
  // jewellery title, and Style takes it only for a measured statement
  // piece — before the description's first line copies the title.
  if (statementApplies(listing)) {
    listing.title = statementOutOfTitle(listing.title, listing.brand ?? "");
    if (!isStatement(listing)) listing.item_specifics = withoutStatementStyle(listing.item_specifics);
  }
  // A size not made in America: the title says both, the label's first
  // and the American one beside it — "Size EU 54 US 7", "EU 50 US 40",
  // "EU 104 US 4T" (the seller, 16 Nov 2026).
  listing.title = fitTitle(otherSizeInTitle(ringSizeInTitle(listing.title, listing), listing), 80);
  const descriptionLines = (listing.description ?? "").trim().split(/\r?\n/);
const firstContentIndex = descriptionLines.findIndex((line) => line.trim().length > 0);
if (firstContentIndex >= 0) descriptionLines.splice(firstContentIndex, 1);
const descriptionBody = descriptionLines.join("\n").trim();
listing.description = descriptionBody ? `${listing.title}\n\n${descriptionBody}` : listing.title;
  // The seller's order and her 1000-character limit — applied
  // after the final title is in place, since the title line counts.
  // A European, British or Italian women's size: "Size: EU 38 (US 8,
  // Medium)", from eBay's chart (the seller, 31 Oct 2026).
  listing.description = foreignSizeInDescription(listing.description, listing);
  // Every other size not made in America: rings, men's tailoring and
  // shirts, children's clothing, kids' and baby shoes — "Size: EU 54
  // (US 7)" (the seller, 16 Nov 2026).
  listing.description = ringSizeInDescription(listing.description, listing);
  listing.description = otherSizeInDescription(listing.description, listing);
  // A grown-up's shoe: "Size: 6.5 (EU 37)", as the title has it (21 Nov 2026).
  listing.description = shoeSizeInDescription(listing.description, listing);
  // A letter size is one value outside the title: the card's Size,
  // eBay's Size and the description's Size line say "M", the title
  // keeps "M Medium" (the seller, 10 Nov 2026).
  listing.size = letterOnly(listing.size);
  if (listing.item_specifics?.Size)
    listing.item_specifics = {
      ...listing.item_specifics,
      Size: letterOnly(listing.item_specifics.Size),
    };
  listing.description = letterOnlyInDescription(listing.description);
  const shaped = formatDescription(listing.description, undefined, listing.brand ?? "");
  listing.description = shaped.text;
  if (shaped.dropped.length) listing.description_dropped = shaped.dropped;
  // "Gold" and "silver" only with a karat or sterling mark among the
  // listing's own facts; hashtags in the seller's order.
  const marks = tagEvidence(
    [
      listing.title,
      listing.description,
      listing.condition_notes,
      ...Object.values(listing.item_specifics ?? {}),
      ...(listing.maker_marks ?? []),
    ].join(" "),
  );
  listing.hashtags = cleanHashtags(listing.hashtags, marks, isAestheticHashtag);
  listing.etsy_tags = cleanEtsyTags(listing.etsy_tags, marks);
  // A statement hashtag for a statement piece; no big-piece word on the
  // tags of any other.
  Object.assign(listing, statementTags(listing));
  listing.hashtags_original = [...listing.hashtags];
  // Only an id that was actually offered counts as used.
  if (!ctx.phraseIds.includes(listing.style_phrase_id ?? ""))
    listing.style_phrase_id = "";
  listing.etsy_tags_original = [...listing.etsy_tags];
  // Same principle for the optional storewide markup: applied pre-review,
  // so the price on the card is exactly the price that publishes.
  listing.suggested_price = applyPriceMarkup(
    listing.suggested_price,
    priceMarkupPercent(),
  );
  return listing;
}

/**
 * Everything before the AI writes: the body checked, the models allowed, the
 * photos read, and the first step (what kind of item it is) done. The same
 * for "now" and for the queue, so both start from the same place.
 */
export async function startAnalysis(
  raw: unknown,
  deadline: number,
): Promise<
  | { error: string; status: number }
  | {
      body: AnalyzeRequestBody;
      client: Anthropic;
      imageBlocks: ImageBlock[];
      analysisModel: string;
      profile: string;
    }
> {
  let body: AnalyzeRequestBody;
  try {
    body = readAnalyzeBody(raw);
  } catch {
    return { error: "Invalid request body.", status: 400 };
  }
  // Validate client-supplied models against the server allowlist; fall back to
  // the trusted default on anything unknown (prevents billing an arbitrary or
  // premium model to the owner's key).
  const analysisModel = resolveModel(body.analysisModel, ANALYSIS_MODEL);
  const routerModel = resolveModel(body.routerModel, ROUTER_MODEL);
  if (!Array.isArray(body.images) || body.images.length === 0)
    return { error: "Please add at least one photo.", status: 400 };
  const imageBlocks = toImageBlocks(body.images);
  if (imageBlocks.length === 0)
    return { error: "No readable photos found. Use JPG, PNG, or WebP.", status: 400 };
  let client: Anthropic;
  try {
    client = getClient();
  } catch (e) {
    return { error: (e as Error).message, status: 500 };
  }
  // The first step only tells what kind of thing this is, so it looks at
  // the small copies when they match the photos one for one; otherwise at
  // the full ones, exactly as before.
  const smallBlocks = toImageBlocks(body.routerImages ?? []);
  const routerBlocks = smallBlocks.length === imageBlocks.length ? smallBlocks : imageBlocks;
  const profile = await routeProfile(client, routerBlocks, body.profile, routerModel, deadline);
  return { body, client, imageBlocks, analysisModel, profile };
}
