// SKUs in the seller's format (30 Oct 2026):
//
//   2026-10-30-1-COG12
//   └ date ┘ │  └ what she paid, whole dollars (only when she enters it)
//            └ the item's number that day — 1, 2, 3…
//
// The date is the day the listing is made, so a glance at the SKU says when
// the item went up and which one it was that day. A shelf or bin code, when
// she types one, goes in front: B12-2026-10-30-1. Letters, digits and hyphens
// only — every marketplace she crosslists to accepts them.

export function sanitizeSku(value: string): string {
  let sku = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  sku = sku.replace(/-+/g, "-").replace(/^[-._]+|[-._]+$/g, "");
  return sku.slice(0, 50);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date in this device's own time zone: "2026-10-30". */
export function dateCode(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** What every SKU of today's batch starts with: the shelf (if any), then the date. */
export function skuPrefix(shelf: string, now: Date = new Date()): string {
  const s = sanitizeSku(shelf);
  const d = dateCode(now);
  return s ? `${s}-${d}` : d;
}

// The Nth item (counting from 0) under a prefix: "2026-10-30" + 0 → "2026-10-30-1".
export function buildSku(prefix: string, index: number): string {
  const clean = sanitizeSku(prefix);
  const n = Math.max(0, Math.floor(index)) + 1;
  return clean ? `${clean}-${n}` : String(n);
}

const COG = /-COG\d+$/i;

/**
 * The SKU with the cost of goods at the end, in whole dollars: "…-1" + 12 →
 * "…-1-COG12". An empty cost takes the part off again; a new cost replaces
 * the old one, so the field can be changed as often as she likes.
 */
export function withCost(sku: string, cost: unknown): string {
  const base = String(sku ?? "").replace(COG, "");
  if (cost === "" || cost === null || cost === undefined) return base;
  const whole = Math.round(Number(cost));
  if (!Number.isFinite(whole) || whole < 0) return base;
  const tail = `-COG${whole}`;
  return `${base.slice(0, 50 - tail.length)}${tail}`;
}

/**
 * Where numbering under this prefix continues, given the SKUs that already
 * exist (on eBay, on the work screen, in History): the index for buildSku.
 * "2026-10-30-1", "2026-10-30-4-COG12" → 4, so the next item is "-5".
 */
export function nextIndexFromSkus(
  existingSkus: string[],
  prefix: string,
): number {
  const clean = sanitizeSku(prefix);
  if (!clean) return 0;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}-(\\d+)(?:-COG\\d+)?(?:-[a-f0-9]{12})?$`, "i");
  let max = 0;
  for (const sku of existingSkus) {
    const m = re.exec(String(sku || "").trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return max;
}
