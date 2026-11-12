/**
 * The description's shape — the seller's rules of 27 Oct 2026.
 *
 * At most 800 characters: eBay shows a description of that length in full on
 * a phone ("a listing description on a mobile device cannot exceed 800
 * characters" — eBay's mobile guide). Labeled sections, a blank line between
 * them, always in the same order, so a buyer on a phone finds what she
 * looks for in the same place every time:
 *
 *   title → Brand → Condition → measurements → Size → everything else
 *
 * The measurements stand right after Condition, one per line, no heading
 * and no bullets: "Length: Approximately 1.5 in (3.8 cm)" (12 Nov 2026).
 *
 * No "Keywords" section and no hashtags in the description: eBay's search
 * gives the description little weight, and the space is worth more to the
 * buyer. Tags for Depop, Mercari and Etsy live in their own block on the card
 * and never reach eBay.
 *
 * The model is told all this; this file is the guarantee. It reorders the
 * sections, takes out what does not belong, and — only when the text is still
 * too long — leaves out whole sections from the least needed end. It never
 * cuts a sentence in half and never touches the title, Brand, Condition,
 * Size, the measurements, Material, the stones or the hallmarks.
 */

export const DESCRIPTION_LIMIT = 800;

// The measurements: right after Condition, before Size (12 Nov 2026).
const MEASURE_RANK = 2.5;
// "Pendant: Approximately 2 W x 2.75 H in" is a measurement too.
const MEASURED_VALUE =
  /^\s*(?:approximately|approx\.?|about|adjustable)?\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*(?:[WHD]\b|in\b|inch|cm\b|mm\b|g\b|oz\b|"|x\b)/i;

interface Rank {
  test: RegExp;
  rank: number;
}

// Where each labeled section stands. Anything not named here goes just
// before the hallmarks and label details, in the order the model wrote it.
const RANKS: Rank[] = [
  { test: /^brand$/i, rank: 1 },
  { test: /^condition$/i, rank: 2 },
  { test: /^(?:size|ring size|marked size|tagged size|shoe size)$/i, rank: 3 },
  {
    test: /^(?:actual measurements|measurements|dimensions|length|width|height|depth|diameter|weight|pit to pit|pit-to-pit|chest|bust|waist|hips?|inseam|rise|shoulders?|sleeves?|sleeve length|drop|strap drop|handle drop|heel height|circumference)$/i,
    rank: MEASURE_RANK,
  },
  // The piece's own name or collection, where "Type" used to stand — the
  // seller's rule of 28 Oct 2026 ("Style: Good As Gold").
  { test: /^(?:style|style name|collection)$/i, rank: 5 },
  { test: /^colou?rs?$/i, rank: 6 },
  { test: /^(?:materials?|fabric|metal|metal purity|metal type)$/i, rank: 7 },
  {
    test: /^(?:the stones?|stones?|main stone|secondary stones?|accent stones?|gemstones?)$/i,
    rank: 8,
  },
  {
    test: /^(?:design|details|the pendant|pendant|setting|pattern|features?|construction)$/i,
    rank: 9,
  },
  { test: /^(?:closure|clasp|fit|chain or bail|chain|bail|backs?)$/i, rank: 10 },
  { test: /^(?:occasion|aesthetic|styling)$/i, rank: 11 },
  {
    test: /^(?:hallmarks?|marks?|markings?|stamps?|labels?|tags?|collection|style\/model name|style\/model code|model|model name|model number|reference number|upc|country of manufacture|made in|care)$/i,
    rank: 13,
  },
];
const UNKNOWN_RANK = 12;

// Never part of an eBay description.
// "Type" too: the title already says what the item is, and the seller does
// not want the line (28 Oct 2026).
const NOT_IN_DESCRIPTION =
  /^(?:keywords?|search terms?|seo|seo keywords|hashtags?|tags for other sites|etsy tags?|type|item type)$/i;
const HASHTAG_LINE = /^(?:#[\p{L}\p{N}_]+[\s,]*)+$/u;

// Left out first when the text is too long — least needed first. Anything
// not listed is never left out.
// The seller's opening sentence stays first and is never left out; a true
// closing line ("Discontinued design…") stays last and goes early.
const OPENING_RANK = 0.5;
const CLOSING_RANK = 15;
const DROP_ORDER = [11, CLOSING_RANK, UNKNOWN_RANK, 9, 10, 6, 5];


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
      (rank === 9 || rank === UNKNOWN_RANK) &&
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
      if (s.rank === 5) {
        const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        s.text = s.text.replace(new RegExp(`^(\\s*[^:]+:\\s*)${esc}\\s*`, "i"), "$1");
      }

  sections.sort((a, b) => a.rank - b.rank || a.index - b.index);

  const join = (ss: Section[]) => [title, ...ss.map((s) => s.text)].join("\n\n");
  let kept = sections;
  const dropped: string[] = [];
  for (const rank of DROP_ORDER) {
    while (join(kept).length > limit) {
      const last = [...kept].reverse().find((s) => s.rank === rank);
      if (!last) break;
      kept = kept.filter((s) => s !== last);
      dropped.push(
        last.label ||
          (last.rank === CLOSING_RANK ? "the closing line" : "an unlabeled paragraph"),
      );
    }
    if (join(kept).length <= limit) break;
  }
  const text = join(kept);
  return { text, dropped, length: text.length, over: text.length > limit };
}
