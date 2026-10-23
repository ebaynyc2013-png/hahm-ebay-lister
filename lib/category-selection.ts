import type { ListingResult } from "./types";
import type { CategorySuggestion } from "./ebay/taxonomy";
export function expectedDepartment(l: ListingResult): string {
  if (l.category?.startsWith("womens_")) return "Women";
  if (l.category?.startsWith("mens_")) return "Men";
  return l.item_specifics?.Department || "";
}
// eBay's own leaf-category path names the department outright — "Clothing,
// Shoes & Accessories > Women > Women's Shoes > Sandals". That is a fact from
// eBay's taxonomy, not an inference about the item, which matters because the
// photo-grounded aspect fill is deliberately barred from guessing gender (see
// lib/photo-facts.ts: "Department" is not a visible feature, and a size tag M
// does not establish Men). So the path is the one verifiable source for it.
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
