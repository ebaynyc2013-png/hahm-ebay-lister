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
]);
export interface PhotoFact {
  name: string;
  value: string;
  photoIndices: number[];
  basis: "label" | "visible_feature";
  quote: string;
}
export function acceptedPhotoFact(
  raw: unknown,
  count: number,
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
  return s.basis === "visible_feature" && visible.has(s.name.toLowerCase());
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
