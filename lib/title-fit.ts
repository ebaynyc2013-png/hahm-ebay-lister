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

/**
 * The aesthetics at the end of the title, last first ("Office Siren", "Boho") —
 * what goes first when a second size needs room (the seller, 16 Nov 2026).
 * Each entry is cut from what is left after the ones before it.
 */
export function aestheticTail(title: string, l: { aesthetics?: unknown[] }): string[] {
  const names = [...(l.aesthetics ?? [])]
    .map((a) => String(a ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const out: string[] = [];
  let t = title.trim();
  for (let guard = 0; guard < 4; guard++) {
    const hit = names.find((n) => t.toLowerCase().endsWith(` ${n.toLowerCase()}`));
    if (!hit) break;
    const tail = t.slice(t.length - hit.length);
    out.push(` ${tail}`);
    t = t.slice(0, t.length - hit.length).trim();
  }
  return out;
}
