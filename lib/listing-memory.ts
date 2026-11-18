import { openDb } from "./draft-store";
import { MAX_RULES, type ItemKind, type SellerRule } from "./learn-diff";

/**
 * What the program learned from the seller's corrections (18 Nov 2026):
 * short rules for each kind of item, and which category she moved a type of
 * item to. Kept beside the drafts, under "sellerrule:" and "catmemory:" keys,
 * so the cloud carries them to her other devices like the tag corrections.
 * Text only, never photos.
 */

const STORE = "workspace";
const RULE = "sellerrule:";
const CAT = "catmemory:";

/** Fired on window whenever what was learned changes. */
export const LISTING_MEMORY_EVENT = "listing-memory-changed";

export interface StoredRule extends SellerRule {
  id: string;
  /** The item it was learned from ("Clip-on earrings"). */
  item: string;
  savedAt: number;
}

export interface CategoryMemory {
  /** "clip-on earrings" — her kind of item, in lower case. */
  itemType: string;
  kind: ItemKind;
  categoryId: string;
  categoryPath: string;
  savedAt: number;
}

const range = (k: string) => IDBKeyRange.bound(k, `${k}￿`);

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
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LISTING_MEMORY_EVENT));
}

/** "Clip-On Earrings!" and "clip on earrings" are one kind of item. */
export const typeKey = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export async function rememberRules(
  rules: SellerRule[],
  item: string,
): Promise<StoredRule[]> {
  if (!rules.length) return [];
  const now = Date.now();
  const stored = rules.map((r, i) => ({
    ...r,
    id: `${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    item: item.trim().slice(0, 80) || "item",
    savedAt: now + i,
  }));
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    for (const r of stored) tx.objectStore(STORE).put(r, RULE + r.id);
    await finished(tx);
  } finally {
    db.close();
  }
  changed();
  return stored;
}

/** Every rule, newest first. */
export async function loadRules(): Promise<StoredRule[]> {
  const db = await openDb();
  try {
    const all = (await req(db.transaction(STORE).objectStore(STORE).getAll(range(RULE)))) as StoredRule[];
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function forgetRule(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(RULE + id);
    await finished(tx);
  } finally {
    db.close();
  }
  changed();
}

/** "This kind of item goes in this category" — the newest choice wins. */
export async function rememberCategory(m: Omit<CategoryMemory, "savedAt">): Promise<void> {
  const key = typeKey(m.itemType);
  if (!key || !m.categoryId) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...m, itemType: key, savedAt: Date.now() }, CAT + key);
    await finished(tx);
  } finally {
    db.close();
  }
  changed();
}

export async function loadCategoryMemory(): Promise<CategoryMemory[]> {
  const db = await openDb();
  try {
    const all = (await req(db.transaction(STORE).objectStore(STORE).getAll(range(CAT)))) as CategoryMemory[];
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function forgetCategory(itemType: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(CAT + typeKey(itemType));
    await finished(tx);
  } finally {
    db.close();
  }
  changed();
}

/** The newest rules, as they travel with a request. */
export function rulesToSend(rules: readonly StoredRule[]): SellerRule[] {
  return rules.slice(0, MAX_RULES).map(({ kind, field, rule }) => ({ kind, field, rule }));
}

/**
 * The categories she chose before for items like this one: the same type of
 * item, or one sharing its last word ("clip earrings" and "stud earrings").
 */
export function categoriesFor(
  memory: readonly CategoryMemory[],
  itemType: string | undefined,
): { categoryId: string; categoryPath: string; itemType: string }[] {
  const key = typeKey(itemType ?? "");
  if (!key) return [];
  const last = key.split(" ").at(-1) ?? "";
  return memory
    .filter((m) => m.itemType === key || (last && m.itemType.split(" ").at(-1) === last))
    .sort((a, b) => Number(b.itemType === key) - Number(a.itemType === key))
    .slice(0, 3)
    .map(({ categoryId, categoryPath, itemType: t }) => ({ categoryId, categoryPath, itemType: t }));
}
