import { z } from "zod";
import type { ListingResult } from "./types";

const text = z.string().max(500);
const scalar = z
  .union([z.string().max(500), z.number().finite()])
  .transform(String);
export const CONDITIONS = [
  "NEW_WITH_TAGS",
  "NEW_NO_TAGS",
  "EXCELLENT",
  "VERY_GOOD",
  "GOOD",
  "FAIR",
  "FOR_PARTS_OR_NOT_WORKING",
] as const;
export const listingSchema = z.object({
title: z.string().trim().min(1).max(80),
  description: z.string().max(15000),
  category: text.optional(),
  category_hint: text.optional(),
  category_id: z.string().regex(/^\d*$/).max(20).optional(),
  category_path: z.string().max(400).optional(),
  ebay_condition: text.optional(),
  evidence: z
    .record(
      z.string().max(100),
      z.array(z.number().int().min(1).max(24)).max(24),
    )
    .optional(),
  brand: scalar.optional(),
  item_type: scalar.optional(),
  color: z.union([scalar, z.array(scalar).max(10)]).optional(),
  size: scalar.optional(),
  material: scalar.optional(),
  condition: z.enum(CONDITIONS).optional(),
  condition_notes: z.string().max(3000).optional(),
  seller_notes: z.string().max(2000).optional(),
  web_facts: z.string().max(3000).optional(),
  // Every doubt the writer has is shown to the seller (21 Nov 2026: "show all
  // the questions") — a doubt dropped is a guess that goes out unasked. The
  // limits are generous so that a long answer never fails the whole listing.
  doubts: z
    .array(
      z.object({
        field: z.string().max(100),
        options: z.array(z.string().max(150)).max(20),
        why: z.string().max(300),
      }),
    )
    .max(30)
    .optional(),
  doubts_resolved: z.array(z.string().max(60)).max(20).optional(),
  measurements: text.optional(),
  suggested_price: z
    .union([
      z.number().finite().min(0).max(1_000_000),
      z
        .string()
        .regex(/^(?:\d+(?:\.\d{1,2})?)?$/)
        .max(12),
    ])
    .optional(),
  search_terms: z.array(text).max(4).optional(),
  seo_keywords: z.array(text).max(10).optional(),
  key_features: z.array(text).max(10).optional(),
  aesthetics: z.array(text).max(10).optional(),
  statement: z
    .object({
      answer: z.enum(["yes", "no", "unsure", "not_jewelry"]),
      measure: z.string().max(300),
    })
    .optional(),
  // What the seller has to see — contact details on a photo, maker's marks,
  // possible brands — is never cut short; the limits only stop nonsense.
  contact_seen: z.array(text).max(50).optional(),
  maker_marks: z.array(text).max(30).optional(),
  brand_source: z.enum(["label", "note", "marks", "seller", "none"]).optional(),
  brand_candidates: z
    .array(z.object({ brand: z.string().max(100), why: z.string().max(300) }))
    .max(10)
    .optional(),
  brand_confirmed: z.boolean().optional(),
  brand_remembered: z.boolean().optional(),
  description_dropped: z.array(text).max(20).optional(),
  // Generous on purpose: the model is asked for 5 and 13, and the cleaner
  // trims — one tag too many must never fail a whole analysis.
  hashtags: z.array(text).max(30).optional(),
  etsy_tags: z.array(text).max(40).optional(),
  hashtags_original: z.array(text).max(30).optional(),
  style_phrase_id: z.string().max(40).optional(),
  etsy_tags_original: z.array(text).max(40).optional(),
  item_specifics: z
    .record(
      z.string().min(1).max(100),
      z.union([
        scalar,
        z
          .array(scalar)
          .max(5)
          .transform((v) => v.join(" | ")),
      ]),
    )
    .refine((v) => Object.keys(v).length <= 100, "Too many specifics")
    .optional(),
  item_profile: text.optional(),
  vintage: z
    .object({
      source: z.enum(["note", "clues"]),
      era: z.string().max(40),
      reasons: z.string().max(300).optional(),
      confirmed: z.boolean().optional(),
      before: z
        .object({
          title: z.string().max(200),
          description: z.string().max(15000),
          specifics: z.record(z.string().max(100), z.string().max(1000).nullable()),
        })
        .optional(),
    })
    .optional(),
});
export const imageSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(1).max(2_800_000),
});
export const imagesSchema = z
  .array(imageSchema)
  .min(1)
  .max(24)
  .refine(
    (xs) => xs.reduce((n, x) => n + x.data.length, 0) < 3_800_000,
    "Photo data is too large. Select fewer analysis photos.",
  );
// The small copies for the first step (see AnalyzeRequestBody.routerImages):
// a few tens of kilobytes each, so a tight budget.
export const routerImagesSchema = z
  .array(imageSchema)
  .max(24)
  .refine(
    (xs) => xs.reduce((n, x) => n + x.data.length, 0) < 800_000,
    "Small photo copies are too large.",
  );
export const skuSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/,
    "SKU must be 1–50 letters, numbers, dots, underscores or hyphens.",
  );
export const shippingSchema = z
  .object({
    fulfillmentPolicyId: z.string().min(1).max(100),
    paymentPolicyId: z.string().min(1).max(100),
    returnPolicyId: z.string().min(1).max(100),
    locationKey: z.string().min(1).max(100),
    weightOz: z.number().finite().positive().max(2400).optional(),
    lengthIn: z.number().finite().positive().max(200).optional(),
    widthIn: z.number().finite().positive().max(200).optional(),
    heightIn: z.number().finite().positive().max(200).optional(),
  })
  .refine((s) => {
    const count = [s.lengthIn, s.widthIn, s.heightIn].filter(
      (x) => x !== undefined,
    ).length;
    return count === 0 || count === 3;
  }, "Enter all three dimensions or leave them all blank.");
export type ShippingSelection = z.infer<typeof shippingSchema>;
export function parseListing(raw: unknown): ListingResult {
  return listingSchema.parse(raw);
}

// A draft the seller is still working on may carry a title over eBay's 80:
// she shortens it herself, warned in red under the title (21 Nov 2026), and
// the check bar keeps Post shut until she does. Reading the draft — Prepare,
// "Update with notes", the search online — must not fail on it meanwhile.
// Publishing still reads the listing with parseListing, 80 at most.
const draftListingSchema = listingSchema.extend({
  title: z.string().trim().min(1).max(400),
});
export function parseDraftListing(raw: unknown): ListingResult {
  return draftListingSchema.parse(raw) as ListingResult;
}

/**
 * Words, not characters: a long explanation loses whole words from its end,
 * never half a word.
 */
export function clipWords(value: unknown, limit: number): string {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : s.slice(0, limit)).replace(/[\s,;:&/|-]+$/, "");
}

// The program's own lists, which the AI is asked to keep short. One entry too
// many used to fail the whole listing (21 Nov 2026, found by a check); what is
// over goes, and none of it would reach eBay anyway — Color and Features take
// at most 8 and 5 values there, search phrases only feed the price check.
const MODEL_LIST_CAPS: Record<string, number> = {
  search_terms: 4,
  color: 10,
  key_features: 10,
  seo_keywords: 10,
  aesthetics: 10,
  hashtags: 30,
  etsy_tags: 40,
};

/**
 * The AI's answer made to fit before it is checked, so that writing a little
 * too much never costs the seller a listing she has already paid for: the
 * program's own lists keep their first entries, explanations lose whole words
 * from the end, and a title of any length goes on to be shortened to 80 by
 * whole words. Her doubts, the maker's marks and the possible brands are kept
 * whole (see the schema above).
 */
export function boundModelAnswer(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const [key, cap] of Object.entries(MODEL_LIST_CAPS))
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).slice(0, cap);
  if (typeof out.title === "string") out.title = clipWords(out.title, 400);
  if (Array.isArray(out.doubts))
    out.doubts = out.doubts.map((d) =>
      d && typeof d === "object"
        ? {
            ...(d as Record<string, unknown>),
            field: clipWords((d as Record<string, unknown>).field, 100),
            why: clipWords((d as Record<string, unknown>).why, 300),
            options: Array.isArray((d as Record<string, unknown>).options)
              ? ((d as Record<string, unknown>).options as unknown[]).slice(0, 20).map((o) => clipWords(o, 150))
              : [],
          }
        : d,
    );
  if (Array.isArray(out.brand_candidates))
    out.brand_candidates = out.brand_candidates.map((c) =>
      c && typeof c === "object"
        ? {
            ...(c as Record<string, unknown>),
            brand: clipWords((c as Record<string, unknown>).brand, 100),
            why: clipWords((c as Record<string, unknown>).why, 300),
          }
        : c,
    );
  return out;
}
export function validationMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
      .join("; ");
  return error instanceof Error ? error.message : "Invalid data.";
}
