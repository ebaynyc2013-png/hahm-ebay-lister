import { mostlyNumeric, READ_NOT_JUDGED } from "./ebay/aspects";

// Allow direct label facts and a small set of visible construction attributes.
// An eBay allowed-value list is never evidence that a value is true.
const visible = new Set([
  "color",
  "pattern",
  "sleeve length",
  "neckline",
  "closure",
  "collar",
  "collar style",
  "style",
  "type",
  "accents",
  "features",
  "pocket type",
  // Shoe shape, on the same footing as neckline and closure above: what the
  // shoe is built like, which a photo settles. Substance stays out — "upper
  // material" and "sole material" are no more readable off a picture than
  // plain "material" is, and belong to a label or the seller's own note.
  // "Heel height" stays out too: it is a measurement, and eBay's own aspect
  // takes inches, which no photo establishes without a ruler beside the shoe.
  "heel style",
  "heel type",
  "toe shape",
  "toe style",
  "shoe shaft style",
  "boot style",
  // Counting is not identifying. How many stones are set in a piece is settled
  // by looking at it, the way a pocket type is, and says nothing about what
  // they are — "Main Stone" stays out. Where the setting is a pavé of dozens
  // too small to count, the standing instruction to omit anything unverified
  // leaves the field empty, which is the right answer there.
  "number of stones",
  "number of gemstones",
  "number of diamonds",
]);

// The list above can never keep up: eBay names roughly forty aspects per
// category and names them differently in each — "Dress Length", "Chain Type",
// "Pendant Shape", "Sleeve Type", "Silhouette". They ask the same kind of
// question the list already permits, but under a name it does not hold, so a
// REQUIRED field like Dress Length goes out empty.
//
// Where eBay offers a closed list of values, it has already written down every
// answer there is — "Short | Knee Length | Midi | Long | Hi-Low | Asymmetric".
// Choosing among those from a photo is the same act as choosing a neckline,
// not an invention, so a SELECTION_ONLY aspect is accepted on sight.
//
// Three things it must not swallow. Substance: cotton against linen, silver
// against plate, topaz against citrine — none of it is settled by looking, and
// it stays with the label or the seller's note. Provenance and age: whether a
// dress is vintage or where it was made is not written on its appearance, and
// the fill prompt already forbids inferring those. Lab grading: clarity and
// cut come off a certificate.
const notFromAppearance =
  /\b(material|materials|metal|purity|stone|gemstone|karat|carat|plated?|plating|vintage|antique|era|year|age|origin|manufacture|manufactured|sourced|country|handmade|signed|customized|customised|personalize|personalise|personalized|wholesale|warranty|certif\w*|authentic\w*|grade|clarity|treatment|creation|cut)\b/i;

// "Fabric type" is not among them, though "material" is, and the difference is
// the whole point: eBay's Material is fibre content — Cotton, Linen, Wool —
// which is read off a care tag, while its Fabric Type is weave and
// construction — Denim, Corduroy, Lace, Velvet, Tweed — which is what a
// photograph shows. A denim dress was filing "Denim" under Material, where
// eBay has no such value and nobody filters for it, and leaving Fabric Type,
// where eBay does, empty.

// …except where the question is plainly about appearance after all. "Main
// Stone Color" names a stone but asks for a colour, and a colour is what a
// photograph is best at.
const appearanceHead = new Set(["color", "colour", "shape", "pattern"]);

export interface AspectShape {
  name: string;
  mode: "FREE_TEXT" | "SELECTION_ONLY";
  values: string[];
}

function choosableFromPhoto(aspect?: AspectShape): boolean {
  // What matters is whether eBay supplied the vocabulary, not which flag it
  // set beside it. eBay's own listing form shows Dress Length as a menu of
  // Short, Knee Length, Midi and Long while its Taxonomy API returns the field
  // as FREE_TEXT with those same six values — so a required field went out
  // empty on every dress. Where the values are there, choosing among them is
  // choosing, not inventing.
  if (!aspect || !aspect.values.length) return false;
  const name = aspect.name.toLowerCase();
  // A brand or a size comes off the label or it does not come at all, however
  // long the list eBay offers. Matched as a whole name, so "Size Type"
  // (Regular, Plus, Petites) is untouched by the entry for "size".
  if (READ_NOT_JUDGED.has(name)) return false;
  if (mostlyNumeric(aspect.values)) return false;
  const head = name.split(/[^\p{L}]+/u).filter(Boolean).pop() ?? "";
  if (appearanceHead.has(head)) return true;
  return !notFromAppearance.test(name);
}
export interface PhotoFact {
  name: string;
  value: string;
  photoIndices: number[];
  basis: "label" | "visible_feature";
  quote: string;
}
/**
 * `aspect` is the eBay aspect this fact is destined for, when it is known.
 * The first analysis runs before any category is chosen and passes nothing, so
 * it keeps to the hand-written list above; the fill pass knows the category
 * and can let eBay's own menus widen what counts.
 */
export function acceptedPhotoFact(
  raw: unknown,
  count: number,
  aspect?: AspectShape,
): raw is PhotoFact {
  return photoFactProblem(raw, count, aspect) === null;
}

/**
 * Why a proposed fact is refused, in a few plain words — or null when it is
 * accepted. Shown to the seller in the photo-analysis line, so a refusal says
 * what was missing rather than vanishing into a count.
 */
export function photoFactProblem(
  raw: unknown,
  count: number,
  aspect?: AspectShape,
): string | null {
  if (!raw || typeof raw !== "object") return "unreadable answer";
  const s = raw as PhotoFact;
  if (
    typeof s.name !== "string" ||
    typeof s.value !== "string" ||
    !s.value.trim() ||
    s.value.length > 500
  )
    return "unreadable answer";
  if (
    !Array.isArray(s.photoIndices) ||
    !s.photoIndices.length ||
    !s.photoIndices.every((i) => Number.isInteger(i) && i > 0 && i <= count)
  )
    return "no photo cited";
  if (s.basis === "label") {
    if (typeof s.quote !== "string" || !s.quote.trim())
      return "label not quoted";
    const normalize = (v: string) =>
      " " +
      v
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim() +
      " ";
    // A size tag M does not establish Men, Regular fit or a manufacturing year.
    if (
      /year.*manufact|manufact.*year/i.test(s.name) &&
      !/manufactured|made in \d{4}/i.test(s.quote)
    )
      return "the label shows no year";
    return s.value
      .split(" | ")
      .every(
        (v) =>
          normalize(s.quote).includes(normalize(v)) ||
          measurementInQuote(v, s.quote),
      )
      ? null
      : "not what the label says";
  }
  if (s.basis !== "visible_feature") return "no reason given";
  if (isStoneAbsence(s.value, aspect)) return null;
  return visible.has(s.name.toLowerCase()) || choosableFromPhoto(aspect)
    ? null
    : "needs a label or your note, not just a look";
}

// A stone field is one that asks WHICH stone: Main Stone, Secondary Stone,
// Gemstone, Accent Stone. Not its colour, shape, cut, size or count.
const STONE_FIELD = /\b(?:gem)?stones?\b/i;
const STONE_DETAIL =
  /\b(?:colou?r|shape|creation|treatment|clarity|depth|length|width|size|weight|number|count|grade|cut|setting)\b/i;
const ABSENCE = /^(?:no(?:\s+main)?\s+stones?|none)$/i;

/**
 * "No Stone" from a photo — for every kind of jewellery, in every category
 * whose stone field offers it (the seller's rule, 27 Oct 2026).
 *
 * Which stone a piece holds is not settled by looking — topaz and citrine,
 * glass and crystal — and stays with a label or the seller's note. But that
 * a piece holds no stone at all, only metal, is exactly what a photo shows.
 * The rule against naming a stone by eye was refusing that too: a plain gold
 * pendant came back with "No Stone" refused, and in categories where Main
 * Stone is required (fine earrings) the listing could not have posted.
 * Only eBay's own word for "none", and only on its own — "No Stone | Pearl"
 * is not an absence.
 */
export function isStoneAbsence(value: string, aspect?: AspectShape): boolean {
  if (!aspect) return false;
  if (!STONE_FIELD.test(aspect.name) || STONE_DETAIL.test(aspect.name)) return false;
  const v = value.trim();
  if (!ABSENCE.test(v)) return false;
  return aspect.values.some((x) => x.trim().toLowerCase() === v.toLowerCase());
}
export const PHOTO_FACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    value: { type: "string" },
    photoIndices: { type: "array", items: { type: "integer" } },
    basis: { type: "string", enum: ["label", "visible_feature"] },
    quote: { type: "string" },
  },
  required: ["name", "value", "photoIndices", "basis", "quote"],
};

// A measurement is the same measurement however it is written: eBay's list
// says "35 in", the screenshot says "Adjustable 35-40", the note says 35".
// Word-for-word matching refused the Premier Designs necklace's length (28
// Oct 2026). So a value that is a number with a unit passes when the label
// carries that number and does not give it in a different unit.
const UNIT_OF: [RegExp, string][] = [
  [/^(?:in|inch|inches|"|”|'')$/i, "in"],
  [/^(?:cm|centimet(?:er|re)s?)$/i, "cm"],
  [/^(?:mm|millimet(?:er|re)s?)$/i, "mm"],
  [/^(?:ft|feet|foot|')$/i, "ft"],
  [/^(?:g|grams?)$/i, "g"],
  [/^(?:oz|ounces?)$/i, "oz"],
];
const unitOf = (u: string) => UNIT_OF.find(([re]) => re.test(u.trim()))?.[1] ?? "";
const MEASURE_WORDS =
  /\b(?:adjustable|adjusts|length|long|measures?|measurements?|chain|cord|drop|width|wide|inseam|pit|waist|hips?|rise|heel|height|tall|diameter|circumference|wrist)\b/i;
const MEASURE_VALUE = /^\s*(\d+(?:\.\d+)?)\s*(in|inch|inches|"|”|''|cm|mm|ft|g|oz)?\s*$/i;

export function measurementInQuote(value: string, quote: string): boolean {
  const m = value.match(MEASURE_VALUE);
  if (!m) return false;
  const num = Number(m[1]);
  const unit = m[2] ? unitOf(m[2]) : "";
  // Every number in the quote, with the unit written after it (if any). A
  // range "35-40" counts both ends; the unit after the range covers both.
  const found: { n: number; unit: string; range: boolean }[] = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(inches|inch|in\b|"|”|''|cm|mm|ft\b|feet|grams?|g\b|oz|ounces?)?/gi;
  for (const q of String(quote).matchAll(re)) {
    const u = q[3] ? unitOf(q[3]) : "";
    found.push({ n: Number(q[1]), unit: u, range: !!q[2] });
    if (q[2]) found.push({ n: Number(q[2]), unit: u, range: true });
  }
  // A bare number with no unit counts only where the text is plainly about
  // a size — "adjustable 35-40", "length 18" — so "Size 7" or a style
  // number never becomes 7 inches.
  const aboutSize = MEASURE_WORDS.test(quote);
  return found.some(
    (f) =>
      f.n === num &&
      (f.unit ? !unit || f.unit === unit : f.range || aboutSize),
  );
}
