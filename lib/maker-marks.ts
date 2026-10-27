import type { ListingResult } from "./types";

/**
 * Maker's marks and the brand — the seller's rules (27 Oct 2026).
 *
 * A Premier Designs "Good As Gold" necklace went out as Unbranded with "Crown
 * Charm" in its title: the crown tag at the end of its extender is the maker's
 * sign. But a crown alone proves nothing — Juicy Couture and others use crowns
 * too, every maker changed its marks over the years, and sellers on eBay
 * routinely label a cheaper maker as a pricier one. So:
 *
 *   - a name read on the piece, or written on the seller's note, is the brand;
 *   - otherwise a brand is named only when SEVERAL independent marks agree, and
 *     it waits for the seller's confirmation;
 *   - one mark, or a mark several makers share, names no brand: the possible
 *     makers are offered and the seller picks;
 *   - a piece with any maker's mark is never "Unbranded".
 *
 * There is deliberately no hand-written table of marks: the program learns
 * them from the seller's own confirmations (see brand-memory.ts).
 */

const UNBRANDED = /^\s*unbranded\s*$/i;

export interface BrandCandidate {
  brand: string;
  /** Which marks point to this maker. */
  why: string;
}

/**
 * Guarantees after the model has written: a marked piece is never
 * "Unbranded", and a brand named from marks waits for confirmation.
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
    if (l.brand_source !== "marks") l.brand_source = "none";
  }
  // Candidates: real names only, never the brand already chosen, no repeats.
  const seen = new Set<string>();
  l.brand_candidates = (l.brand_candidates ?? [])
    .map((c) => ({ brand: String(c?.brand ?? "").trim(), why: String(c?.why ?? "").trim() }))
    .filter((c) => {
      const key = c.brand.toLowerCase();
      if (!c.brand || UNBRANDED.test(c.brand) || seen.has(key)) return false;
      if (l.brand && key === l.brand.toLowerCase()) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
  l.brand_confirmed = l.brand_source === "marks" && l.brand ? false : undefined;
}

/** Whether the brand still waits for the seller's word before posting. */
export function brandNeedsConfirmation(l?: ListingResult): boolean {
  return Boolean(
    l && l.brand_source === "marks" && l.brand && l.brand_confirmed === false,
  );
}

/**
 * The seller picked or confirmed the brand: put it everywhere the listing
 * names it. The title gains it after a leading "Vintage <era>" (her order:
 * Vintage and era first, then the brand) when it fits in 80 characters;
 * otherwise the title is left as it is and the result says so.
 */
export function applyChosenBrand(
  l: ListingResult,
  brand: string,
  limit = 80,
): { listing: ListingResult; titleUpdated: boolean } {
  const name = brand.trim();
  const next: ListingResult = {
    ...l,
    brand: name,
    brand_source: "seller",
    brand_confirmed: true,
    item_specifics: { ...(l.item_specifics ?? {}), Brand: name },
  };
  let titleUpdated = false;
  const title = String(l.title ?? "");
  if (name && !title.toLowerCase().includes(name.toLowerCase())) {
    const lead = title.match(/^vintage(?:\s+(?:\d0s|y2k|\d{4}s))?\s+/i)?.[0] ?? "";
    const withBrand = `${lead}${name} ${title.slice(lead.length)}`.trim();
    if (withBrand.length <= limit) {
      next.title = withBrand;
      titleUpdated = true;
    }
  }
  // The description opens with the title and carries a Brand line.
  const lines = String(l.description ?? "").split("\n");
  if (titleUpdated && lines.length && lines[0].trim() === title.trim())
    lines[0] = next.title;
  const brandLine = lines.findIndex((x) => /^\s*brand\s*:/i.test(x));
  if (brandLine >= 0) lines[brandLine] = `Brand: ${name}`;
  else if (name) lines.splice(Math.min(2, lines.length), 0, `Brand: ${name}`, "");
  next.description = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { listing: next, titleUpdated };
}

/** "Photo 2: crown tag…" → 2. The photo a mark was seen on, when named. */
export function photoNumberOfMark(mark: string): number | null {
  const m = mark.match(/\bphoto\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}
