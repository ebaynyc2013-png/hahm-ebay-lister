import type { ListingResult } from "./types";
import type { AspectMeta } from "./ebay/taxonomy";
import { matchAllowed } from "./ebay/aspects";

// Seller-requested defaults, not facts inferred from the photos. Apply only
// to empty fields while preparing the draft, never during publication.
export function applyListingDefaults(
  listing: ListingResult,
  meta: AspectMeta[],
  acceptedIds: Set<number>,
): void {
  const sizeType = meta.find((a) => a.name === "Size Type");
  if (
    !listing.item_specifics?.["Size Type"]?.trim() &&
    sizeType &&
    (sizeType.mode === "FREE_TEXT" || sizeType.values.includes("Regular"))
  ) {
    listing.item_specifics = {
      ...listing.item_specifics,
      "Size Type": "Regular",
    };
    if (listing.evidence) {
      listing.evidence = { ...listing.evidence };
      delete listing.evidence["Size Type"];
    }
  }
  // Customized: the seller's standing answer is No — she almost never has a
  // customized piece, and changes it by hand when she does (27 Oct 2026).
  // Personalize: No as well — she never sells a personalized piece (31 Oct
  // 2026). Only where eBay asks the question and offers "No" as an answer.
  // The photo pass cannot supply either: neither is visible, and its check
  // refused the "No" it was asked to give.
  answerNo(listing, meta, /^customi[sz]ed$/i);
  answerNo(listing, meta, /^personali[sz]ed?$/i);
  // Unit Quantity: always 1 — she sells one item per listing (31 Oct 2026).
  // eBay gives no list for it; the photo check refuses a number from a look.
  const unitQuantity = meta.find((a) => /^unit quantity$/i.test(a.name));
  if (unitQuantity && !listing.item_specifics?.[unitQuantity.name]?.trim())
    setDefault(listing, unitQuantity.name, "1");
  // The eBay condition follows the grade the AI gave from the photos (the
  // seller's rule, 31 Oct 2026: it judges, starting from Excellent, and the
  // menu, the condition notes and the description always agree). Clothing
  // categories (those offering 2990): 2990 is Pre-owned Excellent, 3000 is
  // Pre-owned Good there, 3010 Pre-owned Fair. A choice already made — the
  // seller's — is never replaced.
  if (!listing.ebay_condition && acceptedIds.has(2990)) {
    const byGrade: Record<string, [number, string]> = {
      EXCELLENT: [2990, "PRE_OWNED_EXCELLENT"],
      VERY_GOOD: [3000, "USED_EXCELLENT"],
      GOOD: [3000, "USED_EXCELLENT"],
      FAIR: [3010, "PRE_OWNED_FAIR"],
      NEW_WITH_TAGS: [1000, "NEW"],
      NEW_NO_TAGS: [1500, "NEW_OTHER"],
    };
    const [id, value] = byGrade[String(listing.condition || "EXCELLENT")] ?? byGrade.EXCELLENT;
    if (acceptedIds.has(id)) listing.ebay_condition = value;
    else if (!listing.condition || listing.condition === "EXCELLENT")
      listing.ebay_condition = "PRE_OWNED_EXCELLENT";
    if (!listing.condition) listing.condition = "EXCELLENT";
  }
}

function setDefault(listing: ListingResult, name: string, value: string): void {
  listing.item_specifics = { ...listing.item_specifics, [name]: value };
  if (listing.evidence) {
    listing.evidence = { ...listing.evidence };
    delete listing.evidence[name];
  }
}

function answerNo(listing: ListingResult, meta: AspectMeta[], name: RegExp): void {
  const field = meta.find((a) => name.test(a.name));
  const no = field ? matchAllowed("No", field.values) : null;
  if (field && no && !listing.item_specifics?.[field.name]?.trim())
    setDefault(listing, field.name, no);
}

/**
 * Handmade: No unless the seller's note or a label says the piece is
 * handmade (31 Oct 2026 — one handmade piece in about 400). Applied after the
 * photo pass, so "handmade" on her note still comes through as Yes; only a
 * field still empty then gets No. Returns whether it filled the field.
 */
export function applyDefaultHandmade(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
): boolean {
  return applyDefaultNo(aspects, meta, /^hand\s?made$/i);
}

/**
 * Wholesale: always No — she never sells wholesale (the seller, 10 Nov 2026).
 * Set after the photo pass and over any answer it gave, in every category
 * where eBay asks. (For other sellers' listings this default must not apply:
 * their Wholesale stays empty — a rule for the future client site.)
 */
export function applyDefaultWholesale(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
): boolean {
  const field = meta.find((a) => /^wholesale$/i.test(a.name.trim()));
  const no = field ? matchAllowed("No", field.values) : null;
  if (!field || !no) return false;
  if ((aspects[field.name] ?? []).length === 1 && aspects[field.name][0] === no) return false;
  aspects[field.name] = [no];
  return true;
}

/**
 * Vintage: No unless her note says vintage or she ticks "Possible vintage"
 * (1 Nov 2026 — eBay's own suggestions offered "Vintage: No" for a modern
 * top). Applied after the photo pass and after her vintage, so only a field
 * still empty then gets No.
 */
export function applyDefaultVintage(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
): boolean {
  return applyDefaultNo(aspects, meta, /^vintage$/i);
}

/**
 * Antique: No unless her note says antique (the seller's rule, 6 Nov 2026 —
 * she almost never sells antiques). After the photo pass, so an "antique" on
 * her note still comes through as Yes.
 */
export function applyDefaultAntique(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
): boolean {
  return applyDefaultNo(aspects, meta, /^antique$/i);
}

/**
 * Signed: Yes whenever anything is written or stamped on the piece itself —
 * a brand, a signature, a maker's mark, a label, even only a "925" or
 * "STERLING" — and No only when nothing is (the seller's rule, 6 Nov 2026:
 * her pieces are almost always signed, Premier Designs included). Only an
 * empty field is filled, so an answer she gave on the card is never changed.
 */
export function applySignedFromMarks(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
  listing: Pick<ListingResult, "maker_marks" | "brand_source">,
): boolean {
  const field = meta.find((a) => /^signed$/i.test(a.name.trim()));
  if (!field) return false;
  const marked =
    (listing.maker_marks ?? []).some((m) => String(m ?? "").trim()) ||
    listing.brand_source === "label" ||
    listing.brand_source === "marks";
  if ((aspects[field.name] ?? []).some((v) => v.trim())) return false;
  if (!marked) return applyDefaultNo(aspects, meta, /^signed$/i);
  const yes = matchAllowed("Yes", field.values);
  if (!yes) return false;
  aspects[field.name] = [yes];
  return true;
}

/**
 * Rhinestones: when the title or the description says rhinestone, Main Stone
 * is Crystal and Material is Rhinestone (the seller's rule, 6 Nov 2026 — by
 * the word only, not by the look). Main Stone is set when it is empty or
 * says rhinestone, crystal or no stone; another real stone (a pearl, a
 * turquoise) is never replaced. Material gets Rhinestone added where eBay
 * allows several values, and set where it allows one.
 */
export function applyRhinestones(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[]; cardinality?: string }[],
  listing: Pick<ListingResult, "title" | "description">,
): boolean {
  const said = `${listing.title ?? ""}\n${listing.description ?? ""}`;
  if (!/\brhine[\s-]?stones?\b/i.test(said)) return false;
  let changed = false;
  const stone = meta.find((a) => /^main stone$/i.test(a.name.trim()));
  if (stone) {
    const current = (aspects[stone.name] ?? []).map((v) => v.trim()).filter(Boolean);
    const replaceable = current.every((v) =>
      /^(?:rhine[\s-]?stones?|crystals?|no(?:\s+main)?\s+stones?|none)$/i.test(v),
    );
    const crystal = stone.values.length ? matchAllowed("Crystal", stone.values) : "Crystal";
    if (replaceable && crystal && !(current.length === 1 && current[0] === crystal)) {
      aspects[stone.name] = [crystal];
      changed = true;
    }
  }
  const material = meta.find((a) => /^material$/i.test(a.name.trim()));
  if (material) {
    const rhinestone = material.values.length
      ? matchAllowed("Rhinestone", material.values)
      : "Rhinestone";
    if (rhinestone) {
      const current = (aspects[material.name] ?? []).map((v) => v.trim()).filter(Boolean);
      if (!current.some((v) => v.toLowerCase() === rhinestone.toLowerCase())) {
        aspects[material.name] =
          material.cardinality === "MULTI" ? [...current, rhinestone] : [rhinestone];
        changed = true;
      }
    }
  }
  return changed;
}

function applyDefaultNo(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
  name: RegExp,
): boolean {
  const field = meta.find((a) => name.test(a.name.trim()));
  if (!field) return false;
  if (aspects[field.name]?.some((v) => v.trim())) return false;
  const no = matchAllowed("No", field.values);
  if (!no) return false;
  aspects[field.name] = [no];
  return true;
}

// Pendant/Locket Type: eBay's list names special kinds of pendant — a letter,
// a coin, a medal, a photo locket — and has no plain "Pendant". For an
// ordinary decorative pendant none of them describes, the seller's answer is
// Charm (28 Oct 2026). Applied after the photo pass, so a kind the photos
// show (Coin, Tassel…) is never overwritten, and only to a piece that has a
// pendant: a plain chain gets nothing.
const SPECIAL_PENDANT =
  /\b(?:lockets?|coins?|medals?|medallions?|bar|tassels?|letters?|initials?|alphabet|dog ?tags?|perfume|amulets?|photo|keepsake|floating)\b/i;

export function applyDefaultPendantType(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
  listing: ListingResult,
): boolean {
  const field = meta.find((a) => /^pendant\s*\/\s*locket type$/i.test(a.name));
  if (!field) return false;
  if (aspects[field.name]?.some((v) => v.trim())) return false;
  const charm = matchAllowed("Charm", field.values);
  if (!charm) return false;
  const said = [
    listing.title,
    listing.item_type,
    ...(aspects.Style ?? []),
    ...(aspects.Type ?? []),
  ].join(" ");
  if (!/\bpendants?\b/i.test(said)) return false;
  if (SPECIAL_PENDANT.test(`${said} ${listing.description ?? ""}`)) return false;
  aspects[field.name] = [charm];
  return true;
}

/**
 * Theme "3D" — the seller's rule, 10 Nov 2026. A Reebok tank came back Theme
 * "3D" twice because "P3 3D" was printed in its logo; for sportswear "Sports"
 * is always the better word. So:
 *   - "3D" is dropped whenever "3D" appears among the marks/text read off the
 *     item (it came from printed letters, not from the design);
 *   - in an activewear / athletic category, "3D" becomes "Sports", and an
 *     empty Theme there is "Sports" too.
 * Only eBay's own words are written.
 */
export function applySportsTheme(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
  listing: Pick<ListingResult, "maker_marks">,
  categoryPath: string,
): boolean {
  const field = meta.find((a) => /^theme$/i.test(a.name.trim()));
  if (!field) return false;
  const name = field.name;
  const before = aspects[name] ?? [];
  const printed = (listing.maker_marks ?? []).some((m) => /\b3D\b/i.test(String(m ?? "")));
  const sporty = /activewear|athletic|sportswear|\bsports?\b/i.test(categoryPath);
  let next = before.filter((v) => !(/^3d$/i.test(v.trim()) && (printed || sporty)));
  const sports = matchAllowed("Sports", field.values);
  if (sporty && sports && (next.length < before.length || !next.length) && !next.includes(sports))
    next = [sports, ...next];
  if (next.length === before.length && next.every((v, i) => v === before[i])) return false;
  if (next.length) aspects[name] = next;
  else delete aspects[name];
  return true;
}

// Jewellery Features (the seller's rules, 12 Nov 2026).
// Nickel-Free: silver, gold and stainless steel are nickel-free — always;
// costume jewellery only when her notes or a screenshot say "nickel free";
// never when nickel is named (Metal Nickel, nickel silver, German silver,
// "contains nickel"). Engraved: only a monogram or cut-in letters — a pattern
// is not engraving; the program keeps Engraved only when the listing names
// letters, a monogram, initials, a name or a date.
const NICKEL_FREE_METALS =
  /^(?:sterling silver|silver|fine silver|yellow gold|white gold|rose gold|multi-tone gold|gold|stainless steel|surgical steel)$/i;
const NICKEL_SAID = /\bnickel\s+silver\b|\bgerman\s+silver\b|\bcontains?\s+nickel\b|\bnickel\s+(?:alloy|base)\b|^nickel$/i;
const ENGRAVED_WORDS = /\b(?:monogram\w*|initials?|letters?|lettering|inscri\w+|engraved\s+(?:with|name|date|words?|text|message)|names?|dates?)\b/i;

export function applyJewelryFeatures(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[]; cardinality?: string }[],
  listing: Pick<ListingResult, "title" | "description" | "seller_notes" | "maker_marks">,
  categoryPath: string,
): boolean {
  if (!/jewel/i.test(categoryPath)) return false;
  const field = meta.find((a) => /^features?$/i.test(a.name.trim()));
  if (!field) return false;
  const name = field.name;
  const before = (aspects[name] ?? []).map((v) => v.trim()).filter(Boolean);
  let next = [...before];
  const metals = ["Metal", "Base Metal"]
    .flatMap((k) => aspects[Object.keys(aspects).find((x) => x.toLowerCase() === k.toLowerCase()) ?? ""] ?? [])
    .map((v) => v.trim());
  const text = [listing.title, listing.description, listing.seller_notes, ...(listing.maker_marks ?? [])].join("\n");
  const nickel = metals.some((m) => NICKEL_SAID.test(m)) || NICKEL_SAID.test(text);
  const nickelFree =
    field.values.find((v) => /^nickel[\s-]?free$/i.test(v)) ?? (field.values.length ? "" : "Nickel-Free");
  const isNickelFree = (v: string) => /^nickel[\s-]?free$/i.test(v);
  if (nickel) next = next.filter((v) => !isNickelFree(v));
  else if (nickelFree && !next.some(isNickelFree)) {
    const fineMetal = metals.length > 0 && metals.every((m) => NICKEL_FREE_METALS.test(m));
    const saidFree = /\bnickel[\s-]?free\b/i.test(`${listing.seller_notes ?? ""}\n${listing.description ?? ""}`);
    if (fineMetal || saidFree) next.push(nickelFree);
  }
  if (next.some((v) => /^engraved$/i.test(v)) && !ENGRAVED_WORDS.test(text))
    next = next.filter((v) => !/^engraved$/i.test(v));
  if (field.cardinality && field.cardinality !== "MULTI") next = next.slice(0, 1);
  if (next.length === before.length && next.every((v, i) => v === before[i])) return false;
  if (next.length) aspects[name] = next;
  else delete aspects[name];
  return true;
}
