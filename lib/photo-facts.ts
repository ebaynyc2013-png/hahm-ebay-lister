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
  /\b(material|materials|fabric|metal|purity|stone|gemstone|karat|carat|plated?|plating|vintage|antique|era|year|age|origin|manufacture|manufactured|sourced|country|handmade|signed|customized|customised|personalize|personalise|personalized|wholesale|warranty|certif\w*|authentic\w*|grade|clarity|treatment|creation|cut)\b/i;

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
  // A free-text aspect has no menu to choose from; whatever eBay wants there
  // is a measurement or a phrase, and guessing it is exactly what these rules
  // exist to stop.
  if (!aspect || aspect.mode !== "SELECTION_ONLY" || !aspect.values.length)
    return false;
  const name = aspect.name.toLowerCase();
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
  if (!raw || typeof raw !== "object") return false;
  const s = raw as PhotoFact;
  if (
    typeof s.name !== "string" ||
    typeof s.value !== "string" ||
    !s.value.trim() ||
    s.value.length > 500 ||
    !Array.isArray(s.photoIndices) ||
    !s.photoIndices.length ||
    !s.photoIndices.every((i) => Number.isInteger(i) && i > 0 && i <= count)
  )
    return false;
  if (s.basis === "label") {
    if (typeof s.quote !== "string" || !s.quote.trim()) return false;
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
      return false;
    return s.value
      .split(" | ")
      .every((v) => normalize(s.quote).includes(normalize(v)));
  }
  return (
    s.basis === "visible_feature" &&
    (visible.has(s.name.toLowerCase()) || choosableFromPhoto(aspect))
  );
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
