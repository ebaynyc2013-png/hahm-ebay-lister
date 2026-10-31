import { matchAllowed } from "@/lib/ebay/aspects";
import type { AspectMeta } from "@/lib/ebay/taxonomy";
import type { ForeignSize } from "@/lib/foreign-size";

/**
 * eBay's Size field takes eBay's own word, chosen from its list — the
 * seller's rule, 31 Oct 2026: "you can't write it there, you have to choose
 * it, like any other size". The title and description keep her "M Medium";
 * the field gets "M", the value buyers filter on. eBay calls the field free
 * text, so "M Medium" was accepted as written — and matched no Size filter.
 *
 * Any clothing category, any letter or numeric size eBay lists. When no value
 * on eBay's list is plainly the one on the label, the field is left empty and
 * the card asks for it ("Enter Size"): a guess there is worse than a question.
 */

// Words for a letter size, longest first so "Extra Large" is not read as "Large".
const WORDS: [RegExp, string][] = [
  [/\b(?:extra|x)[\s-]?small\b/i, "XS"],
  [/\b(?:extra|x)[\s-]?large\b/i, "XL"],
  [/\bsmall\b/i, "S"],
  [/\bmedium\b/i, "M"],
  [/\blarge\b/i, "L"],
];

// The same size spelled another way on a label.
const ALIASES: Record<string, string> = {
  xxs: "2XS",
  xxl: "2XL",
  xxxl: "3XL",
  xxxxl: "4XL",
};

// A European, British or other size system. Turning EU 38 into a US size is
// its own task (still on the list); a bare "38" from such a label must never
// be taken for eBay's US 38.
const FOREIGN = /\b(?:EU|EUR|UK|IT|FR|DE|JP|CN|AU|BR|MX)\b/i;

function onList(word: string, allowed: string[]): string | null {
  const w = word.trim();
  if (!w) return null;
  return matchAllowed(w, allowed) ?? matchAllowed(ALIASES[w.toLowerCase()] ?? "", allowed);
}

/** eBay's value for the size on the label, or null when none is plainly it. */
export function sizeFromList(raw: unknown, allowed: string[]): string | null {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!value || !allowed.length) return null;
  const exact = onList(value, allowed);
  if (exact) return exact;
  if (FOREIGN.test(value)) return null;

  const found: string[] = [];
  const add = (v: string | null) => {
    if (v && !found.includes(v)) found.push(v);
  };
  let rest = value.replace(/\b(?:size|marked|tagged|sz)\b\.?:?/gi, " ");
  for (const [re, letter] of WORDS) {
    if (re.test(rest)) {
      add(onList(letter, allowed));
      rest = rest.replace(re, " ");
    }
  }
  for (const token of rest.split(/[\s,;()]+/)) add(onList(token, allowed));

  if (found.length === 1) return found[0];
  // "Small/Medium", "S/M" — eBay lists the pair as one value.
  if (found.length === 2 && value.includes("/"))
    return onList(`${found[0]}/${found[1]}`, allowed);
  return null;
}

/**
 * Put eBay's own value in the Size field, or empty it so the card asks the
 * seller. Runs after every other fill, so whatever wrote the field — the
 * listing's size, the photo pass, her edit on an earlier pass — ends on
 * eBay's list.
 */
export function pickSizeFromList(
  aspects: Record<string, string[]>,
  meta: AspectMeta[],
  listingSize?: unknown,
  foreign?: ForeignSize | null,
): void {
  const a = meta.find((m) => m.name.toLowerCase() === "size");
  if (!a || !a.values.length) return;
  // A European, British or Italian women's size, converted from eBay's chart:
  // the letter (the seller's choice, 31 Oct 2026), else the US number, else
  // nothing — never the bare European number, which eBay would read as US.
  if (foreign) {
    const chosen = onList(foreign.letter, a.values) ?? onList(foreign.us, a.values);
    if (chosen) aspects[a.name] = [chosen];
    else delete aspects[a.name];
    return;
  }
  const current = aspects[a.name]?.[0] ?? "";
  const source = current.trim() ? current : String(listingSize ?? "");
  if (!source.trim()) return;
  const chosen =
    sizeFromList(source, a.values) ??
    (current.trim() ? sizeFromList(listingSize, a.values) : null);
  if (chosen) aspects[a.name] = [chosen];
  else delete aspects[a.name];
}
