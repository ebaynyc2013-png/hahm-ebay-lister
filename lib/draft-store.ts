import { trackWrites } from "./cloud-dirty";
import type { ItemGroup, Photo } from "./types";
export interface WorkspaceDraft {
  version: 1;
  photos: Photo[];
  groups: ItemGroup[];
  orphanIds: string[];
  binPrefix: string;
  skuStart: number;
  step: "upload" | "review" | "listings";
  updatedAt: number;
}
const DB = "listing-writer-drafts";
/** The database exactly as the browser has it — for the cloud sync itself. */
export function openRawDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("workspace");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
/**
 * The database for the rest of the program. Every key it writes or deletes is
 * noted, so the cloud sync sends exactly what changed (11 Nov 2026).
 */
export async function openDb(): Promise<IDBDatabase> {
  return trackWrites(await openRawDb());
}
export async function loadDraft(): Promise<WorkspaceDraft | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const r = db
        .transaction("workspace")
        .objectStore("workspace")
        .get("current");
      r.onsuccess = () => {
        const d = r.result;
        if (!d) {
          resolve(null);
          return;
        }
        if (
          d.version !== 1 ||
          !Array.isArray(d.photos) ||
          !Array.isArray(d.groups)
        ) {
          reject(new Error("Saved draft version cannot be restored."));
          return;
        }
        d.groups = d.groups.map((g: ItemGroup) => ({
          ...g,
          status: g.status === "writing" ? "idle" : g.status,
          postStatus: g.postStatus === "posting" ? "error" : g.postStatus,
          postError:
            g.postStatus === "posting"
              ? "Publication was interrupted. Retry to check eBay before posting again."
              : g.postError,
        }));
        resolve(d);
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
let queue: Promise<void> = Promise.resolve();
export function saveDraft(draft: WorkspaceDraft): Promise<void> {
  queue = queue
    .catch(() => {})
    .then(async () => {
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("workspace", "readwrite");
          tx.objectStore("workspace").put(draft, "current");
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
  return queue;
}
