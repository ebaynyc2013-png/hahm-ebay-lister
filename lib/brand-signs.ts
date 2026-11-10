// Which marks on an item say WHO made it — and which only say what it is made
// of, its size, or where it was made (the seller's rule, 10 Nov 2026).
//
// A sterling cross stamped only "STERLING" went out without "Unbranded":
// the stamp had been taken for a maker's mark. A metal or purity stamp, a
// size, a care or fabric-content label, "Made in …" — none of them names a
// maker, so on their own they never stand in the way of "Unbranded". This
// holds for every category: jewellery, clothing, shoes, accessories.
//
// Those stamps still count as something written on the piece (eBay's Signed
// stays Yes for a "925"); only the brand ignores them.
//
// A mark is treated as no maker's sign only when every text quoted in it is
// made of such words. Anything else — a name, a logo, a signature, a shape
// with no quoted text, a maker's code like "TM-12" — stays a maker's sign.

const NOT_A_MAKER = new Set(
  [
    // metal and purity
    "925", ".925", "s925", "sterling", "ster", "stg", "silver", "solid", "ss",
    "375", "417", "585", "750", "800", "835", "900", "916", "950", "958", "999",
    "gold", "filled", "plated", "plate", "gf", "gp", "hge", "rgp", "gep", "vermeil",
    "k", "kt", "karat", "ct", "pt", "pt950", "pt900", "plat", "platinum", "palladium",
    "stainless", "steel", "316l", "titanium", "tungsten", "brass", "copper", "bronze",
    "nickel", "free", "rhodium", "cz",
    // origin
    "made", "in", "of", "italy", "china", "thailand", "mexico", "india", "usa",
    "us", "u.s.a.", "taiwan", "korea", "japan", "turkey", "israel", "indonesia",
    "vietnam", "bangladesh", "cambodia", "portugal", "spain", "france", "germany",
    "hong", "kong", "philippines", "peru", "canada", "uk", "england",
    // size
    // (no single letters: a lone "M" or "L" stamped on a piece may be a
    // maker's letter, and a letter is never treated as no sign)
    "size", "sz", "xxs", "xs", "xl", "xxl", "2xl", "3xl", "one", "os",
    "small", "medium", "large", "x-small", "x-large", "petite", "eu", "uk", "us",
    // fabric content and care
    "cotton", "polyester", "spandex", "elastane", "nylon", "rayon", "viscose",
    "wool", "silk", "linen", "acrylic", "leather", "genuine", "suede", "cashmere",
    "hand", "wash", "machine", "cold", "dry", "clean", "only", "do", "not", "bleach",
    "tumble", "low", "iron", "lay", "flat", "to",
  ].map((w) => w.toLowerCase()),
);

// 14k, 18kt, 10K, 1/20, 12k, 100%, sizes like 8, 8.5, 38, 7m.
const NUMERIC_TOKEN = /^(?:\d{1,2}(?:\.\d)?(?:k|kt|ct|m|w|n)?|1\/\d{2}|\d{1,3}%)$/i;

function quotedTexts(mark: string): string[] {
  const out: string[] = [];
  const re = /["“”«»]([^"“”«»]+)["“”«»]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mark))) out.push(m[1]);
  return out;
}

function isNotAMakerText(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .split(/[\s,;:/|·•+&()\-]+/)
    .map((t) => t.replace(/^[^a-z0-9.%]+|[^a-z0-9.%]+$/g, ""))
    .filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((t) => NOT_A_MAKER.has(t) || NUMERIC_TOKEN.test(t));
}

// Words that describe a maker's sign rather than a stamp's text: with any of
// them in the mark, it stays a maker's sign whatever else it says.
const MAKER_CUE =
  /\b(?:logo|signature|signed|maker|brand|trademark|monogram|initials?|crown|heart|star|symbol|emblem|script|copyright|hallmark of|name)\b|[©®™]/i;

// The stamp's own text when the model wrote it without quotes: the words in
// capitals and the numbers ("Photo 3: STERLING stamped lengthwise on the back").
function stampedWords(mark: string): string[] {
  const body = mark.replace(/^\s*photos?\s*[\d\s,&and]*:\s*/i, "");
  return body.match(/(?:\.?\d[\d./%]*[a-z]{0,2}|\b[A-Z][A-Z0-9./]{1,}\b)/g) ?? [];
}

/** True when the mark only states metal, purity, size, content, care or origin. */
export function isNotAMakerMark(mark: string): boolean {
  const text = String(mark ?? "");
  const quoted = quotedTexts(text);
  if (quoted.length) return quoted.every(isNotAMakerText);
  // Unquoted: every word in capitals and every number must be such a word,
  // and nothing in the description may point to a maker's sign.
  if (MAKER_CUE.test(text)) return false;
  const words = stampedWords(text);
  return words.length > 0 && words.every(isNotAMakerText);
}

/** The marks that do say something about who made the item. */
export function makerSigns(marks: readonly string[] | undefined): string[] {
  return (marks ?? [])
    .map((m) => String(m ?? "").trim())
    .filter((m) => m && !isNotAMakerMark(m));
}
