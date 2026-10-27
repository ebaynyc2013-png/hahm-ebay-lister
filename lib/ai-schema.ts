import { PHOTO_FACT_SCHEMA } from "./photo-facts";
const string = { type: "string" };
const strings = { type: "array", items: string };

// The model writes these fields in exactly this order and cannot look ahead.
// The title used to come first — before the model had even said what the item
// was — and a denim shirt dress came back titled "Dress Shirt" while its own
// item_type, a line further down, said Dress. Facts now come first; the title
// is built last, out of them; the description, which opens with the title
// word for word, comes after it.
export const AI_LISTING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: string,
    category_hint: string,
    // Looked for before the brand is named: a mark seen first is a mark the
    // brand has to answer to (never "Unbranded" with a maker's mark in view).
    maker_marks: strings,
    brand: string,
    brand_source: {
      type: "string",
      enum: ["label", "note", "marks", "none"],
    },
    // Possible makers when the marks do not settle it; the seller picks.
    brand_candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { brand: string, why: string },
        required: ["brand", "why"],
      },
    },
    item_type: string,
    color: strings,
    size: string,
    material: string,
    condition: {
      type: "string",
      enum: [
        "EXCELLENT",
        "VERY_GOOD",
        "GOOD",
        "FAIR",
        "FOR_PARTS_OR_NOT_WORKING",
      ],
    },
    condition_notes: string,
    measurements: { type: "string", enum: [""] },
    key_features: strings,
    // Named style aesthetics the item genuinely shows — the words buyers
    // browse by. Empty is a normal answer for a plain item.
    aesthetics: strings,
    // Websites, phones, emails, @handles or QR codes readable in the photos —
    // reported here and written nowhere else (eBay hides listings showing them).
    contact_seen: strings,
    specifics: {
      type: "array",
      items: PHOTO_FACT_SCHEMA,
    },
    search_terms: strings,
    seo_keywords: strings,
    suggested_price: { type: "number" },
    title: { type: "string", maxLength: 80 },
    description: string,
  },
  required: [
    "category",
    "category_hint",
    "maker_marks",
    "brand",
    "brand_source",
    "brand_candidates",
    "item_type",
    "color",
    "size",
    "material",
    "condition",
    "condition_notes",
    "measurements",
    "key_features",
    "aesthetics",
    "contact_seen",
    "specifics",
    "search_terms",
    "seo_keywords",
    "suggested_price",
    "title",
    "description",
  ],
};

/** Fields that must be settled before the title is written. */
export const FACTS_BEFORE_TITLE = [
  "brand",
  "item_type",
  "color",
  "size",
  "material",
  "condition",
  "aesthetics",
  "specifics",
  "search_terms",
] as const;
