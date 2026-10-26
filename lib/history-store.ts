import type { ItemGroup, Photo } from "./types";
import { openDb } from "./draft-store";

/**
 * History: every card that has a written listing, kept in this browser after
 * it leaves the work screen, so it can be returned to work and published later.
 *
 * The work screen holds one batch at a time — "These photos are one item" and
 * "Sort photos" replace every card with the new batch — so the listing for a
 * pair of shoes written earlier was simply gone once a painting was started.
 * Each written card is now copied here as it changes.
 *
 * Photos: a card not yet on eBay keeps its full photos, because publishing
 * needs them. A published card keeps only the small on-screen copies: its full
 * photos already live on eBay, and they are most of the storage.
 *
 * Kept in the drafts database's one object store under "history:" keys, so the
 * database needs no upgrade. Each photo is stored once under its own key, so
 * editing a card's text never rewrites its photos.
 */

const STORE = "workspace";
const CARD = "history:card:";
const FULL = "history:photo:full:";
const SMALL = "history:photo:small:";

export interface HistoryCard {
  id: string;
  savedAt: number;
  published: boolean;
  group: ItemGroup;
}

export interface HistoryEntry extends HistoryCard {
  /** The cover photo's small copy, for the list. */
  thumb?: string;
}

export const isPublished = (g: ItemGroup) => g.postStatus === "posted";

/** The small on-screen copy alone: enough to recognise the item, not to publish it. */
export function smallPhoto(p: Photo): Photo {
  return {
    id: p.id,
    previewUrl: p.previewUrl,
    mediaType: p.mediaType,
    data: "",
  };
}

const range = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}￿`);

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

// What was last written for each card, so an unchanged card is not rewritten
// on every keystroke elsewhere on the page.
const lastSaved = new Map<string, string>();

// Saves run one after another, so an older snapshot can never land on top of
// a newer one.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Copy every written card on the work screen into History. Returns whether
 * anything was written, so the caller reloads the list only when it changed.
 */
export function saveToHistory(
  groups: ItemGroup[],
  photos: Photo[],
): Promise<boolean> {
  const run = queue.catch(() => {}).then(() => writeHistory(groups, photos));
  queue = run;
  return run;
}

async function writeHistory(
  groups: ItemGroup[],
  photos: Photo[],
): Promise<boolean> {
  const cards = groups.filter((g) => g.listing);
  if (!cards.length) return false;
  const pool = new Map(photos.map((p) => [p.id, p]));
  const db = await openDb();
  try {
    const keys = new Set(
      (
        await req(
          db.transaction(STORE).objectStore(STORE).getAllKeys(range("history:")),
        )
      ).map(String),
    );

    // A published card whose photo has left the work screen still needs its
    // small copy, made from the full one History already holds.
    const fullToShrink = cards
      .filter(isPublished)
      .flatMap((g) => g.photoIds)
      .filter((id) => !pool.has(id) && !keys.has(SMALL + id) && keys.has(FULL + id));
    const shrunk = new Map<string, Photo>();
    if (fullToShrink.length) {
      const store = db.transaction(STORE).objectStore(STORE);
      const got = await Promise.all(
        fullToShrink.map((id) => req(store.get(FULL + id))),
      );
      got.forEach((p, i) => p && shrunk.set(fullToShrink[i], smallPhoto(p)));
    }

    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let changed = false;
    for (const g of cards) {
      const published = isPublished(g);
      const signature = JSON.stringify(g);
      if (lastSaved.get(g.id) !== signature || !keys.has(CARD + g.id)) {
        const card: HistoryCard = { id: g.id, savedAt: Date.now(), published, group: g };
        store.put(card, CARD + g.id);
        lastSaved.set(g.id, signature);
        changed = true;
      }
      for (const id of g.photoIds) {
        const p = pool.get(id);
        if (published) {
          const small = p ? smallPhoto(p) : shrunk.get(id);
          if (small && !keys.has(SMALL + id)) {
            store.put(small, SMALL + id);
            keys.add(SMALL + id);
            changed = true;
          }
          if (keys.has(FULL + id) && keys.has(SMALL + id)) {
            store.delete(FULL + id);
            keys.delete(FULL + id);
            changed = true;
          }
        } else if (p && !keys.has(FULL + id) && !keys.has(SMALL + id)) {
          // A photo with no full copy (one that came back from History as a
          // small copy) is kept as the small copy it is.
          store.put(p.data ? p : smallPhoto(p), (p.data ? FULL : SMALL) + id);
          keys.add((p.data ? FULL : SMALL) + id);
          changed = true;
        }
      }
    }
    await finished(tx);
    return changed;
  } finally {
    db.close();
  }
}

/** Every card in History, newest first, each with its cover photo. */
export async function loadHistory(): Promise<HistoryEntry[]> {
  const db = await openDb();
  try {
    const cards = (await req(
      db.transaction(STORE).objectStore(STORE).getAll(range(CARD)),
    )) as HistoryCard[];
    const store = db.transaction(STORE).objectStore(STORE);
    const covers = await Promise.all(
      cards.map(async (c) => {
        const id = c.group.photoIds[0];
        if (!id) return undefined;
        const [small, full] = await Promise.all([
          req(store.get(SMALL + id)),
          req(store.get(FULL + id)),
        ]);
        return ((small ?? full) as Photo | undefined)?.previewUrl;
      }),
    );
    return cards
      .map((c, i) => ({ ...c, thumb: covers[i] }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

/** A card's photos as History holds them: full where kept, else the small copy. */
export async function historyPhotos(ids: string[]): Promise<Photo[]> {
  const db = await openDb();
  try {
    const store = db.transaction(STORE).objectStore(STORE);
    const found = await Promise.all(
      ids.map(async (id) => {
        const [full, small] = await Promise.all([
          req(store.get(FULL + id)),
          req(store.get(SMALL + id)),
        ]);
        return (full ?? small) as Photo | undefined;
      }),
    );
    return found.filter((p): p is Photo => Boolean(p));
  } finally {
    db.close();
  }
}

/** Remove one card from History for good, with any photo no other card uses. */
export async function deleteFromHistory(id: string): Promise<void> {
  const db = await openDb();
  try {
    const cards = (await req(
      db.transaction(STORE).objectStore(STORE).getAll(range(CARD)),
    )) as HistoryCard[];
    const target = cards.find((c) => c.id === id);
    const usedElsewhere = new Set(
      cards.filter((c) => c.id !== id).flatMap((c) => c.group.photoIds),
    );
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete(CARD + id);
    for (const pid of target?.group.photoIds ?? []) {
      if (usedElsewhere.has(pid)) continue;
      store.delete(FULL + pid);
      store.delete(SMALL + pid);
    }
    await finished(tx);
    lastSaved.delete(id);
  } finally {
    db.close();
  }
}

/** For tests: forget what this page believes it has already saved. */
export function resetHistoryMemo(): void {
  lastSaved.clear();
}
