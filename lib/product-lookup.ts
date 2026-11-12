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

export interface ProductLookup {
  status: "searching" | "found" | "similar" | "not_found" | "error";
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
  /** What the listing update changed, for the screen. */
  changed?: string[];
  usd?: number;
  error?: string;
}

// Other sellers' words, never a source of facts.
const RESALE =
  /(?:^|\.)(?:ebay|poshmark|mercari|depop|etsy|grailed|vinted|therealreal|vestiairecollective|thredup|tradesy|rebag|fashionphile|facebook|craigslist|offerup|amazon|walmart|aliexpress|temu|shein|pinterest|worthpoint|liveauctioneers|1stdibs|rubylane|chairish)\.[a-z.]+$/i;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export const isResale = (url: string) => RESALE.test(hostOf(url));

export const LOOKUP_RULES = `You find ONE resale item's own product page on the web, to make its eBay listing exact. You see small photos of the item and what was already written about it.

SEARCH: at most 3 searches. Search for the exact item — brand, model or style name, colour, material, any style number on a tag or note — on the brand's own website and on big established stores (department stores and well-known retailers: Saks Fifth Avenue, Bloomingdale's, Nordstrom, Neiman Marcus, Macy's, Selfridges, Net-a-Porter, the brand's own shop and the like). An item without a brand: search by what it plainly is and any mark or stamp on it.

NEVER use resale or marketplace sites as a source of facts — eBay, Poshmark, Mercari, Depop, Etsy, Grailed, Vinted, The RealReal, Vestiaire, ThredUp, Amazon, Walmart marketplace and the like. Those are other sellers' words. You may list them under "resale" as suggestions only.

DECIDE THE MATCH — be strict:
- "found": a brand or big-store page for THIS item — the same brand, the same model or style, the same colour or pattern and material as the photos and the tag. Give every fact that page states.
- "similar": pages for close items (another colour, another size of the same model, a look-alike) — list them under "similar"; give NO facts.
- "not_found": nothing close.
Never fill a fact from your own memory, only from the page you found. Never guess.

Return ONLY this JSON (no other words):
{"status":"found|similar|not_found","source":{"site":"Saks Fifth Avenue","title":"page title","url":"https://…"},"product_name":"","model_name":"","official_color":"","material":"","dimensions":"","country":"","retail_price":"","other_facts":[""],"similar":[{"title":"","url":""}],"resale":[{"title":"","url":""}]}
- "material": the materials and composition exactly as the page gives them ("100% cotton; leather trim").
- "dimensions": as the page gives them ("13.4\\"H x 16.5\\"W x 6.3\\"D").
- "country": where it was made, only if the page names a country ("Made in China"); "Imported" is not a country — leave it "".
- "retail_price": the page's price with the currency ("$298").
- "other_facts": other facts the page states about this item — closure, pockets, strap drop, lining, hardware, care, features.
Empty string or [] for anything the page does not state.`;

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
    if (source && isResale(source.url)) resale.unshift({ title: source.title, url: source.url });
    status = similar.length ? "similar" : "not_found";
  } else if (status === "found" && b && !/^unbranded|^handmade/.test(b) && !named.includes(b.split(/\s+/)[0])) {
    similar = [{ title: source?.title ?? "", url: source?.url ?? "" }, ...similar].filter((x) => x.url);
    status = "similar";
  }
  similar = similar.filter((x) => !isResale(x.url));
  const out: ProductLookup = { status, similar, resale: resale.slice(0, 5) };
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
