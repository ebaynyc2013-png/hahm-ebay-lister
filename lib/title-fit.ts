/**
 * A title longer than eBay's 80 characters loses whole words from its end —
 * never half a word (13 Nov 2026: a Sledge USA tee came back as
 * "…T-Shirt Tee M Medium Ro", cut in the middle of a word). The writer puts
 * the strongest words first and the size before the extra keywords, so the
 * end is what can go.
 *
 * Client-safe: no server imports.
 */
export function fitTitle(title: string, limit = 80): string {
  const t = String(title ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= limit) return t;
  const words = t.split(" ");
  while (words.length > 1 && words.join(" ").length > limit) words.pop();
  const out = words.join(" ");
  // One word longer than the limit has nowhere to break.
  return out.length <= limit ? out.replace(/[\s,;:&/|-]+$/, "") : out.slice(0, limit);
}
