// A letter size is ONE value everywhere except the title (the seller, 31 Oct
// and 10 Nov 2026). The title carries the letter and the word — "M Medium",
// "XS X-Small" — but the card's Size field, eBay's Size and the description's
// Size line carry only the letter, as eBay's own drop-down does: "M".
//
// Only a plain letter size followed by its own word is touched. European,
// British, Italian, shoe and numeric sizes are left exactly as they are.

const WORDS: Record<string, string[]> = {
  XXS: ["xx-small", "xxsmall", "xx small"],
  XS: ["x-small", "xsmall", "x small", "extra small"],
  S: ["small"],
  M: ["medium"],
  L: ["large"],
  XL: ["x-large", "xlarge", "x large", "extra large"],
  XXL: ["xx-large", "xxlarge", "xx large", "2x-large"],
  "2XL": ["xx-large", "2x-large", "2x large"],
  "3XL": ["xxx-large", "3x-large", "3x large"],
};

/** "M Medium" → "M", "xs x-small" → "XS"; anything else unchanged. */
export function letterOnly(size: unknown): string {
  const s = String(size ?? "").trim();
  const m = s.match(/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL)\s+(.+)$/i);
  if (!m) return s;
  const letter = m[1].toUpperCase();
  const word = m[2].trim().toLowerCase().replace(/\s+/g, " ");
  return WORDS[letter]?.includes(word) ? letter : s;
}

/** The description's own "Size: M Medium" line becomes "Size: M". */
export function letterOnlyInDescription(description: string): string {
  return String(description ?? "").replace(
    /^([ \t]*Size:[ \t]*)([^\r\n]+?)[ \t]*$/gim,
    (line, head: string, value: string) => {
      const one = letterOnly(value);
      return one !== value.trim() ? `${head}${one}` : line;
    },
  );
}
