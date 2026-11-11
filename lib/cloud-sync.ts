"use client";
// The lister's cloud sync (11 Nov 2026): the same work screen, History,
// learned marks and tags in every Chrome profile and on every device.
//
// The browser database stays the working copy — the lister reads and writes it
// exactly as before, so nothing slows down and nothing breaks when the network
// does. This module mirrors it:
//   pull — when the lister opens (and when it comes back into view): fetch
//          every record that changed elsewhere, with its photos;
//   push — a few seconds after anything is saved: send the changed records,
//          and any photo the cloud does not have yet.
//
// One record per saved key; the last write of a key wins — except the work
// screen, where two copies that both changed are merged (nothing dropped).

import { accessHeaders, apiPost } from "./api-client";
import {
  base64ToBytes,
  fingerprint,
  isPhotoRef,
  mergeWorkScreens,
  packRecord,
  refsIn,
  revDeleted,
  revTime,
  unpackRecord,
  type PhotoRef,
} from "./cloud-records";
import { clearDirty, dirtyKeys, isLocalOnly, markDirty, onDirty, stampOf } from "./cloud-dirty";
import { openRawDb } from "./draft-store";
import { derivedCopies } from "./resize";
import type { Photo } from "./types";

const STORE = "workspace";
const META = "cloud:meta";
const WORK = "current";

interface Meta {
  v: 1;
  /** The cloud revision this browser last had for each key. */
  revs: Record<string, string>;
  /** Fingerprint of what this browser last sent or received for each key. */
  sigs: Record<string, string>;
  /** Photos known to be in the photo store. */
  photos: Record<string, 1>;
  /** Everything in this browser has been offered to the cloud once. */
  joined?: boolean;
  lastGc?: number;
}

export interface SyncState {
  phase: "off" | "needsCode" | "idle" | "pulling" | "pushing" | "error";
  message: string;
}

let state: SyncState = { phase: "off", message: "" };
const watchers = new Set<(s: SyncState) => void>();
function set(s: Partial<SyncState>) {
  state = { ...state, ...s };
  watchers.forEach((w) => w(state));
}
export const syncState = () => state;

// The screen listens here: work from another profile or device arrived after
// the lister opened, and is already in this browser's database.
const changeWatchers = new Set<() => void>();
export function onCloudChanges(fn: () => void): () => void {
  changeWatchers.add(fn);
  return () => changeWatchers.delete(fn);
}
export function onSyncState(fn: (s: SyncState) => void): () => void {
  watchers.add(fn);
  fn(state);
  return () => watchers.delete(fn);
}

// ---------- browser database ----------

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openRawDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}
const readKey = (key: string) =>
  withDb((db) => req(db.transaction(STORE).objectStore(STORE).get(key)) as Promise<unknown>);
const allKeys = () =>
  withDb(async (db) => (await req(db.transaction(STORE).objectStore(STORE).getAllKeys())).map(String));

async function readMeta(): Promise<Meta> {
  const m = (await readKey(META)) as Meta | undefined;
  return m?.v === 1 ? m : { v: 1, revs: {}, sigs: {}, photos: {} };
}
async function writeMeta(m: Meta): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(m, META);
    await done(tx);
  });
}

// ---------- server ----------

class CloudOff extends Error {}
class NeedsCode extends CloudOff {}

async function call(body: unknown): Promise<any> {
  const res = await fetch("/api/cloud/records", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accessHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new NeedsCode();
  if (res.status === 503 || data?.code === "CLOUD_OFF") throw new CloudOff();
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Cloud error ${res.status}`);
  return data;
}

async function uploadPhoto(p: Photo): Promise<void> {
  const b64 = p.uploadData || p.data;
  const res = await fetch(`/api/cloud/photo?id=${encodeURIComponent(p.id)}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", ...accessHeaders() },
    body: base64ToBytes(b64) as BodyInit,
  });
  if (!res.ok) throw new Error(`A photo could not be saved to the cloud (${res.status}).`);
}

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function downloadPhoto(ref: PhotoRef): Promise<Photo> {
  const res = await fetch(`/api/cloud/photo?id=${encodeURIComponent(ref.id)}`, {
    headers: accessHeaders(),
  });
  if (!res.ok) throw new Error(`A photo could not be read from the cloud (${res.status}).`);
  const jpeg = await res.blob();
  const { data, previewUrl } = await derivedCopies(jpeg);
  return {
    id: ref.id,
    mediaType: "image/jpeg",
    data,
    previewUrl,
    uploadData: await blobToBase64(jpeg),
    original: jpeg,
  };
}

// ---------- pull ----------

/**
 * A photo the cloud could not give back is left out, so the screen never gets
 * a photo without a picture. (A record that IS such a photo is skipped.)
 */
export function withoutMissingPhotos(v: unknown): unknown {
  if (isPhotoRef(v)) return undefined;
  if (Array.isArray(v)) return v.filter((x) => !isPhotoRef(x)).map(withoutMissingPhotos);
  if (v && typeof v === "object" && !(typeof Blob !== "undefined" && v instanceof Blob)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const y = withoutMissingPhotos(x);
      if (y !== undefined) out[k] = y;
    }
    return out;
  }
  return v;
}

async function localPhotos(ids: string[]): Promise<Map<string, Photo>> {
  // A photo this browser already has, under any record, is not downloaded again.
  const want = new Set(ids);
  const found = new Map<string, Photo>();
  if (!want.size) return found;
  await withDb(async (db) => {
    const store = db.transaction(STORE).objectStore(STORE);
    for (const id of want) {
      const p = (await req(store.get(`history:photo:full:${id}`))) as Photo | undefined;
      if (p?.data) found.set(id, p);
    }
    const work = (await req(store.get(WORK))) as { photos?: Photo[] } | undefined;
    for (const p of work?.photos ?? []) if (want.has(p.id) && p.data && !found.has(p.id)) found.set(p.id, p);
  });
  return found;
}

/**
 * Bring this browser up to date with the cloud. Returns how many records
 * changed here.
 */
export async function pull(onProgress?: (msg: string) => void): Promise<number> {
  const meta = await readMeta();
  const { revs } = (await call({ action: "revs" })) as { revs: Record<string, string> };
  const changed = Object.keys(revs).filter(
    (k) => !isLocalOnly(k) && revs[k] !== meta.revs[k] && revTime(revs[k]) > revTime(meta.revs[k]),
  );
  if (!changed.length) return 0;

  // Deleted elsewhere: delete here too, unless changed here since.
  const deletions = changed.filter((k) => revDeleted(revs[k]));
  const updates = changed.filter((k) => !revDeleted(revs[k]));

  const values: Record<string, string | null> = {};
  for (let i = 0; i < updates.length; i += 100) {
    const got = await call({ action: "get", keys: updates.slice(i, i + 100) });
    Object.assign(values, got.values ?? {});
  }

  // Photos the incoming records need and this browser does not have.
  const refIds = new Set<string>();
  for (const k of updates) if (values[k]) refsIn(values[k]!).forEach((id) => refIds.add(id));
  const have = await localPhotos([...refIds]);
  const missing = [...refIds].filter((id) => !have.has(id));
  let n = 0;
  for (const id of missing) {
    onProgress?.(`Bringing photos from the cloud… ${++n} of ${missing.length}`);
    try {
      have.set(id, await downloadPhoto({ __photo: 1, id, mediaType: "image/jpeg" }));
      meta.photos[id] = 1;
    } catch {
      /* a photo the cloud no longer has: its record keeps the reference */
    }
  }

  let applied = 0;
  // What changed here — read as late as possible, right before writing. The
  // first time this browser meets the cloud, everything it has counts as
  // changed here: nothing of it is replaced, its work screen is merged.
  const dirty = new Set(dirtyKeys());
  if (!meta.joined) for (const k of await allKeys()) if (!isLocalOnly(k)) dirty.add(k);
  const localWork = dirty.has(WORK) && updates.includes(WORK) ? await readKey(WORK) : undefined;
  await withDb(async (db) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const k of deletions) {
      if (!dirty.has(k)) {
        store.delete(k);
        delete meta.sigs[k];
        applied++;
      }
      meta.revs[k] = revs[k];
    }
    for (const k of updates) {
      const json = values[k];
      if (json == null) continue;
      let value = withoutMissingPhotos(unpackRecord(json, (ref) => have.get(ref.id)));
      if (value === undefined) continue; // a photo record whose photo is gone
      if (dirty.has(k)) {
        // Changed here and there. The work screen is merged; for anything
        // else this browser's newer change is sent over the cloud's.
        if (k !== WORK) {
          meta.revs[k] = revs[k];
          continue;
        }
        value = mergeWorkScreens(localWork, value);
      }
      store.put(value, k);
      meta.revs[k] = revs[k];
      meta.sigs[k] = fingerprint(json);
      applied++;
    }
    await done(tx);
  });
  // The merged work screen goes back to the cloud with the next push.
  if (dirty.has(WORK) && updates.includes(WORK)) markDirty(WORK);
  await writeMeta(meta);
  return applied;
}

// ---------- push ----------

const BATCH_CHARS = 3_000_000; // under Vercel's 4.5 MB request limit

/** Send everything changed here. Returns how many records were sent. */
export async function push(onProgress?: (msg: string) => void): Promise<number> {
  const meta = await readMeta();
  const present = new Set((await allKeys()).filter((k) => !isLocalOnly(k)));
  // First time in this browser: offer everything it has.
  const keys = meta.joined ? dirtyKeys() : [...new Set([...present, ...dirtyKeys()])];
  if (!keys.length) {
    if (!meta.joined) {
      meta.joined = true;
      await writeMeta(meta);
    }
    return 0;
  }

  const stamps = keys.map((k) => [k, stampOf(k)] as [string, number]);
  const puts: { key: string; value: string }[] = [];
  const deletes: string[] = [];
  const photos = new Map<string, Photo>();
  for (const k of keys) {
    if (!present.has(k)) {
      if (meta.revs[k] && !revDeleted(meta.revs[k])) deletes.push(k);
      continue;
    }
    const { json, photos: inside } = packRecord(await readKey(k));
    const sig = fingerprint(json);
    if (meta.sigs[k] === sig && meta.revs[k]) continue; // same as the cloud has
    inside.forEach((p, id) => photos.set(id, p));
    puts.push({ key: k, value: json });
  }

  // Photos first, so no record ever points at a photo the cloud lacks.
  const toSend = [...photos.values()].filter((p) => !meta.photos[p.id]);
  let n = 0;
  for (const p of toSend) {
    onProgress?.(`Saving photos to the cloud… ${++n} of ${toSend.length}`);
    await uploadPhoto(p);
    meta.photos[p.id] = 1;
    if (n % 10 === 0) await writeMeta(meta); // progress survives a closed tab
  }

  let batch: typeof puts = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const { revs } = await call({ action: "put", items: batch });
    for (const it of batch) {
      meta.revs[it.key] = revs[it.key];
      meta.sigs[it.key] = fingerprint(it.value);
    }
    batch = [];
    size = 0;
  };
  for (const it of puts) {
    if (size + it.value.length > BATCH_CHARS) await flush();
    batch.push(it);
    size += it.value.length;
  }
  await flush();
  if (deletes.length) {
    const { revs } = await call({ action: "delete", keys: deletes });
    for (const k of deletes) {
      meta.revs[k] = revs[k];
      delete meta.sigs[k];
    }
  }

  meta.joined = true;
  await writeMeta(meta);
  clearDirty(stamps);
  return puts.length + deletes.length;
}

/** Ask the photo store to drop photos no record uses — at most once a day. */
async function cleanUpPhotos(): Promise<void> {
  const meta = await readMeta();
  if (meta.lastGc && Date.now() - meta.lastGc < 24 * 60 * 60 * 1000) return;
  const keep = new Set<string>();
  for (const k of await allKeys()) {
    if (k.startsWith("history:photo:full:")) keep.add(k.slice("history:photo:full:".length));
  }
  const work = (await readKey(WORK)) as { photos?: { id: string; data?: string }[] } | undefined;
  for (const p of work?.photos ?? []) if (p.data || isPhotoRef(p)) keep.add(p.id);
  const res = await fetch("/api/cloud/photo", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...accessHeaders() },
    body: JSON.stringify({ keep: [...keep] }),
  });
  if (!res.ok) return;
  for (const id of Object.keys(meta.photos)) if (!keep.has(id)) delete meta.photos[id];
  meta.lastGc = Date.now();
  await writeMeta(meta);
}

// ---------- the loop ----------
// Pulls and pushes run strictly one after another (they share the bookkeeping).

let running: Promise<void> | null = null;
let again = false;
let wantPull = false;
let started = false;
let hiddenAt = 0;
let onPulled: ((n: number) => void) | null = null;

function run(withPull = false): Promise<void> {
  if (withPull) wantPull = true;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const pulling = wantPull;
        wantPull = false;
        if (pulling) {
          set({ phase: "pulling", message: "Checking the cloud…" });
          const n = await pull((m) => set({ message: m }));
          onPulled?.(n);
        }
        set({ phase: "pushing", message: "Saving to the cloud…" });
        await push((m) => set({ message: m }));
        // Only right after a pull: this browser then knows every photo in use.
        if (pulling) await cleanUpPhotos().catch(() => {});
        set({ phase: "idle", message: "Saved in the cloud" });
      } while (again);
    } catch (e) {
      if (e instanceof CloudOff) set({ phase: "off", message: "" });
      else set({ phase: "error", message: `Cloud: ${(e as Error).message} Your work is saved on this device.` });
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Before the lister reads its saved work: bring in what changed elsewhere.
 * Waits at most `waitMs` (a few seconds): then the lister opens with what this
 * browser has, and work from elsewhere appears on the screen as soon as it has
 * arrived (onCloudChanges). Saving to the cloud runs in the background. When
 * the cloud is not connected, returns at once.
 */
export async function startCloudSync(
  onProgress?: (msg: string) => void,
  waitMs = 3_000,
): Promise<void> {
  if (started) return;
  started = true;
  let status: { records?: boolean; photos?: boolean } = {};
  try {
    status = await call({ action: "status" });
  } catch (e) {
    // A new Chrome profile has no access code yet: the screen offers to enter it.
    if (e instanceof NeedsCode) set({ phase: "needsCode", message: "Cloud: needs the access code" });
    else set({ phase: "off" });
    return;
  }
  if (!status.records || !status.photos) {
    set({ phase: "off" });
    return;
  }

  let opened = false;
  const firstPull = new Promise<void>((resolve) => {
    onPulled = (n) => {
      if (!opened) {
        opened = true;
        resolve();
      } else if (n) changeWatchers.forEach((w) => w());
    };
  });
  const unsub = onSyncState((s) => {
    if (s.phase === "pulling") onProgress?.(s.message);
  });

  // Push a few seconds after anything is saved.
  let timer: ReturnType<typeof setTimeout> | undefined;
  onDirty(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(false), 4000);
  });
  // Leaving the tab: send now. Coming back after a while: bring in changes.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      void run(false);
    } else if (hiddenAt && Date.now() - hiddenAt > 30_000) {
      void run(true);
    }
  });

  const finished = run(true);
  await Promise.race([firstPull, finished, new Promise((r) => setTimeout(r, waitMs))]);
  opened = true; // from here on, changes that arrive go straight onto the screen
  unsub();
}

/** "Turn on cloud" in a profile without the access code: ask for it, then reload. */
export async function enterCodeForCloud(): Promise<void> {
  const res = await apiPost("/api/cloud/records", { action: "status" });
  if (res.ok) location.reload();
}

/** "Sync now" from the screen. */
export const syncNow = () => run(true);
