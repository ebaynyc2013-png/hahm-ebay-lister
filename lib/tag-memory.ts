import { openDb } from "./draft-store";
import type { ListingResult } from "./types";

/**
 * The seller's corrections to hashtags and Etsy tags — how the program learns
 * from her (her wish, 28 Oct 2026: "I need the program to learn this too").
 *
 * When she changes the tags on a card and presses Remember, what she took out
 * and what she put in is kept here with the kind of item it was: "high-waisted
 * denim shorts — removed #y2kstyle", "cigarette case — removed #darkacademia,
 * added #retroglam". The newest corrections go along with every analysis as
 * her rules for similar items. Text only, no photos: a fraction of a cent.
 *
 * Stored in this browser beside the drafts, under "taglesson:" keys.
 */

const STORE = "workspace";
const KEY = "taglesson:";

/** How many corrections go along with each analysis (newest first). */
export const MAX_LESSONS = 20;
/** Fired on window whenever the stored corrections change. */
export const TAG_MEMORY_EVENT = "tag-memory-changed";

export type TagKind = "hashtags" | "etsy";

export interface TagLesson {
  id: string;
  kind: TagKind;
  /** What the item was: its type, and its title for context. */
  item: string;
  title?: string;
  removed: string[];
  added: string[];
  savedAt: number;
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
    window.dispatchEvent(new Event(TAG_MEMORY_EVENT));
}

const key = (t: string) => t.trim().toLowerCase();

/**
 * What she changed, or null when nothing was taken out or put in (a change of
 * order alone teaches nothing that can be said as a rule).
 */
export function lessonFromEdit(
  kind: TagKind,
  before: string[] | undefined,
  after: string[] | undefined,
  listing: Pick<ListingResult, "item_type" | "title">,
): Omit<TagLesson, "id" | "savedAt"> | null {
  const was = (before ?? []).map((t) => t.trim()).filter(Boolean);
  const now = (after ?? []).map((t) => t.trim()).filter(Boolean);
  const wasKeys = new Set(was.map(key));
  const nowKeys = new Set(now.map(key));
  const removed = was.filter((t) => !nowKeys.has(key(t)));
  const added = now.filter((t) => !wasKeys.has(key(t)));
  if (!removed.length && !added.length) return null;
  return {
    kind,
    item: (listing.item_type || listing.title || "item").trim().slice(0, 80),
    title: listing.title?.trim().slice(0, 100) || undefined,
    removed: removed.slice(0, 13),
    added: added.slice(0, 13),
  };
}

/** One line, as the model and the seller both read it. */
export function describeLesson(l: Pick<TagLesson, "kind" | "item" | "title" | "removed" | "added">): string {
  const what = l.kind === "hashtags" ? "hashtags" : "Etsy tags";
  const parts = [
    l.removed.length ? `removed ${l.removed.join(", ")}` : "",
    l.added.length ? `added ${l.added.join(", ")}` : "",
  ].filter(Boolean);
  const title = l.title && l.title !== l.item ? ` ("${l.title}")` : "";
  return `${l.item}${title} — ${what}: ${parts.join("; ")}`;
}

export async function rememberTagLesson(
  entry: Omit<TagLesson, "id" | "savedAt">,
): Promise<TagLesson> {
  const lesson: TagLesson = {
    ...entry,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
  };
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(lesson, KEY + lesson.id);
    await finished(tx);
  } finally {
    db.close();
  }
  changed();
  return lesson;
}

/** Every correction, newest first. */
export async function loadTagLessons(): Promise<TagLesson[]> {
  const db = await openDb();
  try {
    const all = (await req(
      db.transaction(STORE).objectStore(STORE).getAll(range()),
    )) as TagLesson[];
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function forgetTagLesson(id: string): Promise<void> {
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

/** What goes along with an analysis: the newest corrections, as lines. */
export function lessonsForAnalysis(lessons: TagLesson[]): string[] {
  return lessons.slice(0, MAX_LESSONS).map(describeLesson);
}
