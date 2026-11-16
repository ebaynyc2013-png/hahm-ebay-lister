/**
 * The description's shape — the seller's rules of 27 Oct 2026.
 *
 * At most 1000 characters (the seller, 15 Nov 2026: the sites she lists on,
 * Vendoo among them, take up to 1000; it was 800, what eBay shows in full on a
 * phone — "a listing description on a mobile device cannot exceed 800
 * characters", eBay's mobile guide). Labeled sections, a blank line between
 * them, always in the same order, so a buyer on a phone finds what she
 * looks for in the same place every time (the seller's order, 15–16 Nov 2026):
 *
 *   title → opening sentence → Brand → Condition → measurements → Size →
 *   Color → Material → stones → Hallmarks / Model → Details → Style →
 *   closing line
 *
 * The measurements stand right after Condition, one per line, no heading
 * and no bullets: "Length: Approximately 1.5 in (3.8 cm)" (12 Nov 2026).
 * Details is ONE paragraph: a Design, Closure, Fit, Chain or Bail section
 * joins it. There is no Occasion section.
 *
 * No "Keywords" section and no hashtags in the description: eBay's search
 * gives the description little weight, and the space is worth more to the
 * buyer. Tags for Depop, Mercari and Etsy live in their own block on the card
 * and never reach eBay.
 *
 * The model is told all this; this file is the guarantee. It reorders the
 * sections and takes out what does not belong. It never leaves out a whole
 * section (16 Nov 2026) — only a true closing line ("Discontinued design…"),
 * and only when the text is still over the limit; whatever is over after
 * that, the seller shortens herself, by the red "Over 1000 by N" on the
 * draft. It never cuts a sentence in half.
 */

export const DESCRIPTION_LIMIT = 1000;

// The measurements: right after Condition, before Size (12 Nov 2026).
const MEASURE_RANK = 2.5;
// "Pendant: Approximately 2 W x 2.75 H in" is a measurement too.
const MEASURED_VALUE =
  /^\s*(?:approximately|approx\.?|about|adjustable)?\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*(?:[WHD]\b|in\b|inch|cm\b|mm\b|g\b|oz\b|"|x\b)/i;

interface Rank {
  test: RegExp;
  rank: number;
}

// The Details paragraph and the piece's own name, last before the closing line.
const DETAILS_RANK = 8;
const STYLE_RANK = 9;

// Where each labeled section stands (the seller's order, 15–16 Nov 2026).
// Anything not named here goes just after Details, in the order the model
// wrote it. The array order matters where two lists share a word: the first
// that matches wins ("Collection" is the piece's name, so Style).
const RANKS: Rank[] = [
  { test: /^brand$/i, rank: 1 },
  { test: /^condition$/i, rank: 2 },
  { test: /^(?:size|ring size|marked size|tagged size|shoe size)$/i, rank: 3 },
  {
    test: /^(?:actual measurements|measurements|dimensions|length|width|height|depth|diameter|weight|pit to pit|pit-to-pit|chest|bust|waist|hips?|inseam|rise|shoulders?|sleeves?|sleeve length|drop|strap drop|handle drop|heel height|circumference)$/i,
    rank: MEASURE_RANK,
  },
  // The piece's own name or collection — the seller's rule of 28 Oct 2026
  // ("Style: Good As Gold"), last since 16 Nov 2026.
  { test: /^(?:style|style name|collection)$/i, rank: STYLE_RANK },
  { test: /^colou?rs?$/i, rank: 4 },
  { test: /^(?:materials?|fabric|metal|metal purity|metal type)$/i, rank: 5 },
  {
    test: /^(?:the stones?|stones?|main stone|secondary stones?|accent stones?|gemstones?)$/i,
    rank: 6,
  },
  {
    test: /^(?:hallmarks?|marks?|markings?|stamps?|labels?|tags?|style\/model name|style\/model code|model|model name|model number|reference number|upc|country of manufacture|made in|care)$/i,
    rank: 7,
  },
  {
    test: /^(?:design|details|the pendant|pendant|setting|pattern|features?|construction|closure|clasp|fit|chain or bail|chain|bail|backs?)$/i,
    rank: DETAILS_RANK,
  },
];
const UNKNOWN_RANK = 8.5;

// Never part of an eBay description.
// "Type" too: the title already says what the item is, and the seller does
// not want the line (28 Oct 2026). Occasion neither (16 Nov 2026).
const NOT_IN_DESCRIPTION =
  /^(?:keywords?|search terms?|seo|seo keywords|hashtags?|tags for other sites|etsy tags?|type|item type|occasions?)$/i;
const HASHTAG_LINE = /^(?:#[\p{L}\p{N}_]+[\s,]*)+$/u;

// The seller's opening sentence stays first; a true closing line
// ("Discontinued design…") stays last, and is the only thing ever left out —
// when the text is still over the limit.
const OPENING_RANK = 0.5;
const CLOSING_RANK = 15;


interface Section {
  label: string; // "" for an unlabeled paragraph
  rank: number;
  text: string;
  index: number;
}

const LABEL = /^([\p{L}][\p{L}\p{N} /&'()-]{0,40}?)\s*:\s*/u;
const BULLET = /^\s*(?:[-*•–·]|\d+[.)])\s+/;

function rankOf(label: string): number {
  if (!label) return UNKNOWN_RANK;
  return RANKS.find((r) => r.test.test(label.trim()))?.rank ?? UNKNOWN_RANK;
}

/**
 * Each measurement on its own line, no heading and no bullets (12 Nov 2026):
 * an old "Actual Measurements:" heading goes, its "• " list becomes lines.
 */
function tidyMeasurements(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim().replace(BULLET, ""))
    .filter((l) => l && !/^(?:actual\s+)?measurements\s*:?\s*$/i.test(l))
    .join("\n");
}

export interface FormattedDescription {
  text: string;
  /** Labels of the sections left out to fit the limit. */
  dropped: string[];
  length: number;
  over: boolean;
}

export function formatDescription(
  raw: string,
  limit = DESCRIPTION_LIMIT,
  brand = "",
): FormattedDescription {
  const blocks = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((b) =>
      b
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => !HASHTAG_LINE.test(l.trim()))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
  if (!blocks.length) return { text: "", dropped: [], length: 0, over: false };

  const [title, ...rest] = blocks;
  const sections: Section[] = [];
  rest.forEach((block, index) => {
    const label = block.match(LABEL)?.[1]?.trim() ?? "";
    if (label && NOT_IN_DESCRIPTION.test(label)) return;
    // A paragraph with no label of its own that is only a list continues the
    // section above it ("Actual Measurements:" then the list on its own).
    const prev = sections[sections.length - 1];
    if (!label && prev && block.split("\n").every((l) => BULLET.test(l))) {
      prev.text = `${prev.text}\n${block}`;
      return;
    }
    let rank = rankOf(label);
    if (
      label &&
      (rank === DETAILS_RANK || rank === UNKNOWN_RANK) &&
      MEASURED_VALUE.test(block.slice(block.indexOf(":") + 1))
    )
      rank = MEASURE_RANK;
    // The first paragraph after the title, when it is not one of the known
    // sections, is the seller's warm opening sentence (no label) — even if it
    // happens to contain a colon. The last unknown paragraph is a closing line.
    if (index === 0 && rank === UNKNOWN_RANK) rank = OPENING_RANK;
    else if (index === rest.length - 1 && rank === UNKNOWN_RANK && index > 0) rank = CLOSING_RANK;
    sections.push({ label: rank === OPENING_RANK || rank === CLOSING_RANK ? "" : label, rank, text: block, index });
  });
  for (const s of sections)
    if (s.rank === MEASURE_RANK) s.text = tidyMeasurements(s.text);
  // The measurements stand together, one block (no blank lines between).
  const measured = sections.filter((s) => s.rank === MEASURE_RANK && s.text);
  if (measured.length > 1) {
    measured[0].text = measured.map((s) => s.text).join("\n");
    for (const s of measured.slice(1)) s.text = "";
  }
  for (let i = sections.length - 1; i >= 0; i--) if (!sections[i].text) sections.splice(i, 1);
  // "Style: Premier Designs Good As Gold" → "Style: Good As Gold": the brand
  // has its own line, and repeating it was the seller's complaint.
  const b = brand.trim();
  if (b && !/^unbranded$/i.test(b))
    for (const s of sections)
      if (s.rank === STYLE_RANK) {
        const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        s.text = s.text.replace(new RegExp(`^(\\s*[^:]+:\\s*)${esc}\\s*`, "i"), "$1");
      }

  sections.sort((a, b) => a.rank - b.rank || a.index - b.index);

  // Details is one paragraph (16 Nov 2026): a Design, Closure, Fit, Chain or
  // Bail section joins it on one line — the details first, then the closure,
  // fit, chain and bail, each in the order written.
  const details = sections.filter((s) => s.rank === DETAILS_RANK);
  if (details.length) {
    const fastening = (s: Section) => (/^(?:closure|clasp|fit|chain or bail|chain|bail|backs?)$/i.test(s.label) ? 1 : 0);
    const body = [...details]
      .sort((a, b) => fastening(a) - fastening(b) || a.index - b.index)
      .map((s) => {
        const said = s.text.replace(LABEL, "").replace(/\s*\n\s*/g, " ").trim();
        return /[.!?…)"]$/.test(said) ? said : `${said}.`;
      })
      .filter((t) => t !== ".")
      .join(" ");
    details[0].label = "Details";
    details[0].text = `Details: ${body}`;
    for (const s of details.slice(1)) sections.splice(sections.indexOf(s), 1);
  }

  const join = (ss: Section[]) => [title, ...ss.map((s) => s.text)].join("\n\n");
  let kept = sections;
  const dropped: string[] = [];
  // Over the limit: only the closing line goes. Nothing else is ever left
  // out; the seller sees how far over it is and shortens it herself.
  const closing = kept.find((s) => s.rank === CLOSING_RANK);
  if (closing && join(kept).length > limit) {
    kept = kept.filter((s) => s !== closing);
    dropped.push("the closing line");
  }
  const text = join(kept);
  return { text, dropped, length: text.length, over: text.length > limit };
}
