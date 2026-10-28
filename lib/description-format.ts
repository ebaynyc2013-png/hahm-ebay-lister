/**
 * The description's shape — the seller's rules of 27 Oct 2026.
 *
 * At most 800 characters: eBay shows a description of that length in full on
 * a phone ("a listing description on a mobile device cannot exceed 800
 * characters" — eBay's mobile guide). Labeled sections, a blank line between
 * them, always in the same order, so a buyer on a phone finds what she
 * looks for in the same place every time:
 *
 *   title → Brand → Condition → Size → Actual Measurements → everything else
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
    test: /^(?:actual measurements|measurements|dimensions|length|width|height|weight)$/i,
    rank: 4,
  },
  { test: /^(?:type|item)$/i, rank: 5 },
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
  { test: /^(?:style|occasion|aesthetic|styling)$/i, rank: 11 },
  {
    test: /^(?:hallmarks?|marks?|markings?|stamps?|labels?|tags?|collection|style\/model name|style\/model code|model|model name|model number|reference number|upc|country of manufacture|made in|care)$/i,
    rank: 13,
  },
];
const UNKNOWN_RANK = 12;

// Never part of an eBay description.
const NOT_IN_DESCRIPTION =
  /^(?:keywords?|search terms?|seo|seo keywords|hashtags?|tags for other sites|etsy tags?)$/i;
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

/** Each measurement on its own line, marked "• " — eBay gets them as a list. */
function tidyMeasurements(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return lines.join("\n");
  return [
    lines[0],
    ...lines.slice(1).map((l) => `• ${l.replace(BULLET, "")}`),
  ].join("\n");
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
    // The first paragraph after the title, when it is not one of the known
    // sections, is the seller's warm opening sentence (no label) — even if it
    // happens to contain a colon. The last unknown paragraph is a closing line.
    if (index === 0 && rank === UNKNOWN_RANK) rank = OPENING_RANK;
    else if (index === rest.length - 1 && rank === UNKNOWN_RANK && index > 0) rank = CLOSING_RANK;
    sections.push({ label: rank === OPENING_RANK || rank === CLOSING_RANK ? "" : label, rank, text: block, index });
  });
  for (const s of sections)
    if (s.rank === 4) s.text = tidyMeasurements(s.text);

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
