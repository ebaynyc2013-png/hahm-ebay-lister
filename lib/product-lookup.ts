// Finding the item online (the seller, 12 Nov 2026): for every item she
// loads, the writer searches the web — at most 3 searches — for THIS item's
// page on the brand's own site or a big store (Saks, Bloomingdale's,
// Nordstrom, Neiman Marcus…). Found: its facts go into the listing at once
// and the screen says what changed and where from. Not found exactly: similar
// items are shown, never used. Resale sites (eBay, Poshmark, Mercari…) are
// other sellers' words: shown as suggestions only.
//
// Client-safe: no server imports.

import type { ListingResult } from "./types";

export interface LookupLink {
  title: string;
  url: string;
}

/** A price for this exact item somewhere online, shown as a guide only. */
export interface PriceLink extends LookupLink {
  site: string;
  price: string;
}

export interface ProductLookup {
  status: "searching" | "skipped" | "found" | "similar" | "not_found" | "error";
  source?: LookupLink & { site: string };
  product_name?: string;
  model_name?: string;
  official_color?: string;
  material?: string;
  dimensions?: string;
  country?: string;
  retail_price?: string;
  other_facts?: string[];
  similar?: LookupLink[];
  resale?: LookupLink[];
  /** Prices for THIS exact item on resale sites and in stores — a guide, never a fact. */
  prices?: PriceLink[];
  /** What the listing update changed, for the screen. */
  changed?: string[];
  usd?: number;
  error?: string;
}

// Other sellers' words, never a source of facts.
const RESALE =
  /(?:^|\.)(?:ebay|poshmark|mercari|depop|etsy|grailed|vinted|therealreal|vestiairecollective|thredup|tradesy|rebag|fashionphile|whatnot|facebook|craigslist|offerup|amazon|walmart|aliexpress|temu|shein|pinterest|worthpoint|liveauctioneers|1stdibs|rubylane|chairish)\.[a-z.]+$/i;
// Never used at all, not even for a price (the seller, 13 Nov 2026).
const NEVER = /(?:^|\.)amazon\.[a-z.]+$/i;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export const isResale = (url: string) => RESALE.test(hostOf(url));
export const isNeverUsed = (url: string) => NEVER.test(hostOf(url));

/**
 * No brand, Unbranded or Handmade: no store sells it under a name, so it is
 * not searched at all — no cost (the seller, 13 Nov 2026).
 */
export function needsLookup(l: Pick<ListingResult, "brand">): boolean {
  const b = String(l.brand ?? "").trim();
  return Boolean(b) && !/^(?:unbranded|handmade|hand[\s-]?made|unknown|no brand|n\/?a)\b/i.test(b);
}

export const LOOKUP_RULES = `You find ONE resale item online, to make its eBay listing exact and to show the seller what it sells for. You see small photos of the item and what was already written about it.

SEARCH: at most 3 searches. Search for the exact item — brand, model or style name, colour, material, any style number on a tag or note. Use the searches for two things:
1. The item's own product page: on the brand's own website or shop, or in any known store that sells new clothing and accessories — department stores and chains, luxury or mass-market alike (Saks Fifth Avenue, Bloomingdale's, Nordstrom, Neiman Marcus, Macy's, Selfridges, Net-a-Porter, Zalando, H&M, Forever 21, Zara and the like). You judge which stores count as known stores.
2. Prices for this exact item on resale sites: eBay, Poshmark, Mercari, Depop, Grailed, Etsy, Vestiaire Collective, Whatnot, The RealReal, ThredUp, Fashionphile.

NEVER use Amazon at all — no facts, no prices, no links.

FACTS come ONLY from the brand's page or a known store's page. Resale sites (all of those in 2.) are other sellers' words: never a source of facts, only of prices.

DECIDE THE MATCH — be strict:
- "found": a brand or store page for THIS item — the same brand, the same model or style, the same colour or pattern and material as the photos and the tag. Give every fact that page states.
- "similar": pages for close items (another colour, another size of the same model, a look-alike) — list them under "similar"; give NO facts.
- "not_found": nothing close.
Never fill a fact from your own memory, only from the page you found. Never guess.

PRICES: list a price ONLY for a listing or page of THIS exact item — the same brand, model or style and colour. A similar item's price is left out. The brand's or store's page you found goes in too, with its price. Give the price as the page shows it, with the currency ("$47").

Return ONLY this JSON (no other words):
{"status":"found|similar|not_found","source":{"site":"Macy's","title":"page title","url":"https://…"},"product_name":"","model_name":"","official_color":"","material":"","dimensions":"","country":"","retail_price":"","other_facts":[""],"similar":[{"title":"","url":""}],"prices":[{"site":"Poshmark","price":"$47","title":"listing title","url":"https://…"}]}
- "material": the materials and composition exactly as the page gives them ("100% cotton; leather trim").
- "dimensions": as the page gives them ("13.4\\"H x 16.5\\"W x 6.3\\"D").
- "country": where it was made, only if the page names a country ("Made in China"); "Imported" is not a country — leave it "".
- "retail_price": the brand's or store's price with the currency ("$298").
- "other_facts": other facts the page states about this item — closure, pockets, strap drop, lining, hardware, care, features.
Empty string or [] for anything not found.`;

/** The user turn: what was written about the item so far. */
export function lookupMessage(l: ListingResult): string {
  const known = {
    title: l.title,
    brand: l.brand ?? "",
    item_type: l.item_type ?? "",
    maker_marks: l.maker_marks ?? [],
    seller_notes: l.seller_notes ?? "",
    item_specifics: l.item_specifics ?? {},
    description: (l.description ?? "").slice(0, 900),
  };
  return `WHAT IS KNOWN ABOUT THIS ITEM:\n${JSON.stringify(known, null, 1)}\n\nFind its product page now and return the JSON.`;
}

/** The model's answer, checked: resale pages are never a source; a found page must name the brand. */
export function checkLookup(raw: Partial<ProductLookup> | null | undefined, brand = ""): ProductLookup {
  const r = raw ?? {};
  const links = (xs: unknown): LookupLink[] =>
    (Array.isArray(xs) ? xs : [])
      .map((x) => ({ title: String((x as LookupLink)?.title ?? "").slice(0, 200), url: String((x as LookupLink)?.url ?? "") }))
      .filter((x) => /^https?:\/\//.test(x.url))
      .slice(0, 5);
  const str = (v: unknown, n = 300) => String(v ?? "").trim().slice(0, n);
  let status: ProductLookup["status"] =
    r.status === "found" || r.status === "similar" || r.status === "not_found" ? r.status : "not_found";
  const source = r.source && /^https?:\/\//.test(String(r.source.url ?? ""))
    ? { site: str(r.source.site, 80) || hostOf(r.source.url), title: str(r.source.title, 200), url: String(r.source.url) }
    : undefined;
  let similar = links(r.similar);
  const resale = [...links(r.resale)];
  // A resale page is never the source; a "found" page that does not name the
  // brand is only similar.
  const b = brand.trim().toLowerCase();
  const named = `${r.product_name ?? ""} ${source?.title ?? ""} ${source?.url ?? ""}`.toLowerCase();
  if (status === "found" && (!source || isResale(source.url))) {
    if (source && isResale(source.url) && !isNeverUsed(source.url)) resale.unshift({ title: source.title, url: source.url });
    status = similar.length ? "similar" : "not_found";
  } else if (status === "found" && b && !/^unbranded|^handmade/.test(b) && !named.includes(b.split(/\s+/)[0])) {
    similar = [{ title: source?.title ?? "", url: source?.url ?? "" }, ...similar].filter((x) => x.url);
    status = "similar";
  }
  similar = similar.filter((x) => !isResale(x.url) && !isNeverUsed(x.url));
  const seen = new Set<string>();
  const prices: PriceLink[] = (Array.isArray(r.prices) ? r.prices : [])
    .map((x) => ({
      site: str((x as PriceLink)?.site, 60) || hostOf(String((x as PriceLink)?.url ?? "")),
      price: str((x as PriceLink)?.price, 30),
      title: str((x as PriceLink)?.title, 200),
      url: String((x as PriceLink)?.url ?? ""),
    }))
    .filter((x) => /^https?:\/\//.test(x.url) && !isNeverUsed(x.url) && /\d/.test(x.price))
    .filter((x) => !seen.has(x.url) && Boolean(seen.add(x.url)))
    .slice(0, 12);
  const out: ProductLookup = { status, similar, resale: resale.filter((x) => !isNeverUsed(x.url)).slice(0, 5), prices };
  if (status === "found" && source) {
    Object.assign(out, {
      source,
      product_name: str(r.product_name, 200),
      model_name: str(r.model_name, 120),
      official_color: str(r.official_color, 80),
      material: str(r.material),
      dimensions: str(r.dimensions, 200),
      country: /^\s*imported\s*$/i.test(String(r.country ?? "")) ? "" : str(r.country, 60),
      retail_price: str(r.retail_price, 30),
      other_facts: (Array.isArray(r.other_facts) ? r.other_facts : []).map((f) => str(f, 200)).filter(Boolean).slice(0, 12),
    });
  }
  return out;
}

/**
 * The found page's facts as the seller's new facts for the text update.
 * The page wins over the tag, the ruler and the notes (the seller, 12 Nov
 * 2026). The official colour name goes in the description only; the store
 * and the price are never written into the listing.
 */
export function lookupFacts(r: ProductLookup): string {
  if (r.status !== "found" || !r.source) return "";
  const lines = [
    `These facts come from the item's own product page (${r.source.site}). They are the most reliable source — they win over the tag, the measurements and the seller's notes. Use each one where it belongs: the title, the description and the item specifics.`,
    r.model_name && `Model / style name: ${r.model_name}`,
    r.material && `Material and composition: ${r.material}`,
    r.dimensions &&
      `Measurements: ${r.dimensions} — write them in the listing's own measurement format (inches with the mark ", rounded to the nearest quarter, height first, centimetres in brackets)`,
    r.country && `Country of manufacture: ${r.country}`,
    ...(r.other_facts ?? []).map((f) => `Also: ${f}`),
    r.official_color &&
      `The maker's colour name is "${r.official_color}" — mention it in the description's Color line only; never in the title or the Color item specific.`,
    "Never mention the store, the website or the price in the listing.",
  ].filter(Boolean);
  return lines.join("\n");
}

/** The page's facts as text the eBay pass may quote, like her notes. */
export function lookupEvidence(r: ProductLookup | undefined): string {
  if (!r || r.status !== "found") return "";
  return [r.model_name, r.material, r.dimensions, r.country, ...(r.other_facts ?? [])].filter(Boolean).join("\n");
}
