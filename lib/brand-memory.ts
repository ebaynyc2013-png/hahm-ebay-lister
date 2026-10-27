import { openDb } from "./draft-store";

/**
 * Marks the seller has confirmed — the program's only source for which maker
 * a mark belongs to (her choice, 27 Oct 2026).
 *
 * eBay listings were ruled out as a source: sellers routinely label a cheaper
 * maker as a pricier one (Premier Designs sold as Juicy Couture), so learning
 * from them would learn the mistake. Each time the seller confirms or picks a
 * brand for a piece with a maker's mark, the mark is kept here — its
 * description and the small copy of the photo it was seen on — and the most
 * recent ones are shown to the model as labelled references next time.
 *
 * Stored in this browser beside the drafts, under "brandmark:" keys.
 */

const STORE = "workspace";
const KEY = "brandmark:";

/** How many confirmed marks go along with each analysis (newest first). */
export const MAX_REFERENCES = 8;
/** Fired on window whenever the stored marks change, so lists can refresh. */
export const BRAND_MEMORY_EVENT = "brand-memory-changed";

export interface BrandMark {
  id: string;
  brand: string;
  /** The marks as the model described them, with the photo they were on. */
  marks: string[];
  itemType?: string;
  /** The small copy of the photo showing the mark. */
  image?: { mediaType: string; data: string };
  savedAt: number;
}

export interface MarkReference {
  brand: string;
  marks: string[];
  image?: { mediaType: string; data: string };
}

const range = () => IDBKeyRange.bound(KEY, `${KEY}￿`);

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

function changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(BRAND_MEMORY_EVENT));
}

/** "data:image/jpeg;base64,AAA" → { mediaType, data }. */
export function imageFromDataUrl(url?: string): BrandMark["image"] {
  const m = String(url ?? "").match(/^data:(image\/[a-z]+);base64,(.+)$/i);
  return m ? { mediaType: m[1].toLowerCase(), data: m[2] } : undefined;
}

export async function rememberBrandMark(
  entry: Omit<BrandMark, "id" | "savedAt">,
): Promise<BrandMark> {
  const mark: BrandMark = {
    ...entry,
    brand: entry.brand.trim(),
    marks: entry.marks.map((m) => m.trim()).filter(Boolean).slice(0, 6),
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
  };
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(mark, KEY + mark.id);
    await finished(tx);
  } finally {
    db.close();
  }
  changed();
  return mark;
}

/** Every confirmed mark, newest first. */
export async function loadBrandMarks(): Promise<BrandMark[]> {
  const db = await openDb();
  try {
    const all = (await req(
      db.transaction(STORE).objectStore(STORE).getAll(range()),
    )) as BrandMark[];
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function forgetBrandMark(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY + id);
    await finished(tx);
  } finally {
    db.close();
  }
  changed();
}

/** What goes along with an analysis: the newest confirmed marks. */
export function referencesForAnalysis(marks: BrandMark[]): MarkReference[] {
  return marks.slice(0, MAX_REFERENCES).map((m) => ({
    brand: m.brand,
    marks: m.marks,
    ...(m.image ? { image: m.image } : {}),
  }));
}
