import type { ListingResult } from "./types";
import type { CategorySuggestion } from "./ebay/taxonomy";
export function expectedDepartment(l: ListingResult): string {
  if (l.category?.startsWith("womens_")) return "Women";
  if (l.category?.startsWith("mens_")) return "Men";
  return l.item_specifics?.Department || "";
}
// eBay's own leaf-category path names the department outright — "Clothing,
// Shoes & Accessories > Women > Women's Shoes > Sandals". That is a fact from
// eBay's taxonomy, not an inference about the item, so it is consulted first.
// Where the path names no department, the photo pass may decide it from the
// item's cut or the seller's note (never from a size letter alone), and what
// is still undecided after that falls to her default — see
// applyDefaultDepartment below.
//
// `allowed` is eBay's own value list for the Department aspect in THIS
// category, so a derived value is always one eBay accepts here. Returns "" when
// the path names no department — lighters, art and most jewellery have none.
export function departmentFromCategoryPath(
  path: string,
  allowed: string[],
): string {
  if (!path || !allowed.length) return "";
  const haystack = path.toLowerCase();
  return (
    [...allowed]
      // Longest first, so "Unisex Adults" wins over a bare "Unisex".
      .sort((a, b) => b.length - a.length)
      .find((value) => {
        const needle = value.trim().toLowerCase();
        if (!needle) return false;
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // \b keeps "Men" out of "Women's": there is no word boundary before
        // "men" inside "women". It still matches possessives ("Girls' Shoes").
        return new RegExp(`\\b${escaped}\\b`).test(haystack);
      }) ?? ""
  );
}
/**
 * The seller's own rule for an item nothing else has settled: Women.
 *
 * Department is decided, in order, by eBay's category path, then by the
 * photos, then by her note — she writes "men's" on it whenever the photo
 * cannot show it. When none of those has answered, the item is women's.
 *
 * Only ever a value eBay itself offers in this category. A category whose
 * Department list has no "Women" — "Unisex Adults" alone, say — is left
 * alone, since eBay would reject anything else. Returns whether it applied.
 */
export function applyDefaultDepartment(
  aspects: Record<string, string[]>,
  meta: { name: string; values: string[] }[],
): boolean {
  const dept = meta.find((a) => a.name === "Department");
  if (!dept) return false; // eBay does not ask in this category
  if (aspects.Department?.some((v) => v.trim())) return false;
  const women = dept.values.find((v) => v.toLowerCase() === "women");
  if (!women) return false;
  aspects.Department = [women];
  return true;
}

export function categoryMatches(
  c: CategorySuggestion,
  l: ListingResult,
): boolean {
  const department = expectedDepartment(l);
  const path = c.path.toLowerCase();
  if (department === "Women")
    return /\bwomen\b/.test(path) && !/\bmen\b/.test(path);
  if (department === "Men")
    return /\bmen\b/.test(path) && !/\bwomen\b/.test(path);
  return true;
}
