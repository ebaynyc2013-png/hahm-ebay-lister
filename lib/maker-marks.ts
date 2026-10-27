import type { ListingResult } from "./types";

/**
 * Maker's marks that name a brand when no name is printed — the seller's
 * list, grown as she identifies pieces (started 27 Oct 2026).
 *
 * A Premier Designs "Good As Gold" necklace went out as Unbranded: the only
 * sign of its maker is the little crown tag at the end of the extender chain,
 * and the model took it for decoration ("Crown Charm" in the title). A brand
 * read off a mark is a likelihood, not a reading — several makers use crowns —
 * so it is offered for the seller to confirm before the listing can post.
 */
export interface MakerMark {
  brand: string;
  /** What the mark looks like and where it sits, in words a photo can settle. */
  mark: string;
  /** What else could look like it, and how to tell. */
  caution?: string;
}

export const MAKER_MARKS: MakerMark[] = [
  {
    // Identified by the seller on the "Good As Gold" pendant necklace.
    brand: "Premier Designs",
    mark: "a small crown-shaped tag hanging at the very end of the extender chain, on gold-tone or silver-tone costume jewellery",
    caution:
      "Other makers use crowns too. If any maker's name is stamped or printed anywhere on the piece, that name wins over the crown.",
  },
];

export function makerMarksPromptBlock(): string {
  return MAKER_MARKS.map(
    (m) => `- ${m.brand}: ${m.mark}.${m.caution ? ` ${m.caution}` : ""}`,
  ).join("\n");
}

const UNBRANDED = /^\s*unbranded\s*$/i;

/**
 * The seller's rule, guaranteed after the model has written: a piece that
 * shows a maker's mark is never "Unbranded" — an unknown maker is not no
 * maker, and a buyer searching the brand would never find it. The brand is
 * left empty for the seller to fill in. A brand taken from a known mark waits
 * for her confirmation.
 */
export function applyMakerMarkRules(l: ListingResult): void {
  const marks = (l.maker_marks ?? []).filter((m) => m.trim());
  if (marks.length && UNBRANDED.test(l.brand ?? "")) {
    l.brand = "";
    if (l.item_specifics && UNBRANDED.test(l.item_specifics.Brand ?? "")) {
      const { Brand: _drop, ...rest } = l.item_specifics;
      l.item_specifics = rest;
    }
    l.description = String(l.description ?? "")
      .split("\n")
      .filter((line) => !/^\s*brand:\s*unbranded\.?\s*$/i.test(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
    if (l.brand_source !== "maker_mark") l.brand_source = "none";
  }
  l.brand_confirmed = l.brand_source === "maker_mark" && l.brand ? false : undefined;
}

/** Whether the brand still waits for the seller's word before posting. */
export function brandNeedsConfirmation(l?: ListingResult): boolean {
  return Boolean(l && l.brand_source === "maker_mark" && l.brand && l.brand_confirmed === false);
}
