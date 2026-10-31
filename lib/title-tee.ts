/**
 * A T-shirt is "T-Shirt Tee" in the title — the seller's rule, 31 Oct 2026:
 * women's or men's, whenever the item is a T-shirt, "Tee" goes in as the
 * second word beside "T-Shirt". Buyers type both; eBay shows T-shirts for
 * "tee", but most of its first page carried the word itself (checked 31 Oct).
 *
 * The prompt asks for it; this is the guarantee, added only when it fits in
 * eBay's 80 characters.
 */
// "T-Shirt Dress", "T-Shirt Bra", "T-Shirt Quilt" are other things.
const T_SHIRT =
  /\bT[\s-]?Shirts?\b(?!\s+(?:Dress(?:es)?|Bras?|Quilts?|Blankets?|Yarn|Pillows?|Bags?|Rompers?|Jumpsuits?|Night ?gowns?|Gowns?)\b)/i;
const TEE = /\bTees?\b/i;

export function teeInTitle(title: string, limit = 80): string {
  const m = title.match(T_SHIRT);
  if (!m || TEE.test(title)) return title;
  const at = (m.index ?? 0) + m[0].length;
  const out = `${title.slice(0, at)} Tee${title.slice(at)}`;
  return out.length <= limit ? out : title;
}
