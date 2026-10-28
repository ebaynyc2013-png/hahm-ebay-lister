import { openDb } from "./draft-store";
import { STYLE_PHRASES, type PhraseKind, type StylePhrase } from "./style-phrases";

/**
 * The seller's phrases, used in turn (her rule, 28 Oct 2026: "always rotate
 * all the phrases"). This browser remembers when each phrase was last used;
 * every analysis is offered the least-used few of every kind — never-used
 * first, then the longest unused — so no phrase comes round again until the
 * rest of its kind has had its turn.
 *
 * The item's kind is not known before the analysis, so a few of each kind go
 * along and the model takes the one that fits. A few hundred words: well
 * under a cent.
 */

const STORE = "workspace";
const KEY = "phraseuse";

/** How many of each kind go along with an analysis. */
export const PER_KIND = 6;

export type PhraseUses = Record<string, number>;

const KINDS: PhraseKind[] = [
  "rings",
  "necklaces",
  "earrings",
  "bracelets",
  "keys",
  "home",
  "clothing",
  "general",
];

/** The least-used phrases of each kind, plus every gemstone line. */
export function pickPhrases(
  uses: PhraseUses,
  bank: StylePhrase[] = STYLE_PHRASES,
  perKind = PER_KIND,
): StylePhrase[] {
  const order = new Map(bank.map((p, i) => [p.id, i]));
  const byUse = (a: StylePhrase, b: StylePhrase) =>
    (uses[a.id] ?? 0) - (uses[b.id] ?? 0) || order.get(a.id)! - order.get(b.id)!;
  const out: StylePhrase[] = [];
  for (const kind of KINDS)
    out.push(...bank.filter((p) => p.kind === kind).sort(byUse).slice(0, perKind));
  out.push(...bank.filter((p) => p.kind === "gems"));
  return out;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function loadPhraseUses(): Promise<PhraseUses> {
  const db = await openDb();
  try {
    return ((await req(db.transaction(STORE).objectStore(STORE).get(KEY))) as PhraseUses) ?? {};
  } finally {
    db.close();
  }
}

/** Mark a phrase used now, so the next listings take others first. */
export async function markPhraseUsed(id: string, now = Date.now()): Promise<void> {
  if (!STYLE_PHRASES.some((p) => p.id === id)) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const uses = ((await req(store.get(KEY))) as PhraseUses) ?? {};
    store.put({ ...uses, [id]: now }, KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
