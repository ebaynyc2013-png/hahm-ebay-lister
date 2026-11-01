// "Allow offers" — the seller's request of 1 Nov 2026: on by default for every
// item, with a "Minimum offer amount" she can type; eBay declines lower offers
// by itself (its auto-decline). Client-safe.

export interface OfferChoice {
  allow: boolean;
  /** Offers below this are declined by eBay; empty = no minimum. */
  minimum: number | null;
}

/** The card's choice: offers on unless she turned them off. */
export function offerChoice(g: { allowOffers?: boolean; minOffer?: number | "" | null }): OfferChoice {
  const allow = g.allowOffers !== false;
  const n = Number(g.minOffer);
  const minimum = allow && g.minOffer !== "" && g.minOffer != null && Number.isFinite(n) && n > 0
    ? Math.round(n * 100) / 100
    : null;
  return { allow, minimum };
}

/** Why the minimum cannot go to eBay as it is, or "" — it must be below the price. */
export function offerProblem(choice: OfferChoice, price: unknown): string {
  if (!choice.allow || choice.minimum === null) return "";
  const p = typeof price === "string" ? parseFloat(price) : Number(price);
  if (Number.isFinite(p) && p > 0 && choice.minimum >= p)
    return `Minimum offer amount ($${choice.minimum.toFixed(2)}) must be less than the price ($${p.toFixed(2)}).`;
  return "";
}
