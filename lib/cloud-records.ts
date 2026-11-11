// How a saved record travels to the cloud and back (11 Nov 2026) — plain
// functions, no browser storage, so they can be tested on their own.
//
// A record is whatever the lister keeps under one key in the browser: the work
// screen ("current"), a History card, a learned mark, a tag lesson. Photos
// inside a record are the heavy part, so a full photo (one that still has its
// analysis copy) travels as a small reference — the photo itself goes to the
// photo store once, under its id. Small History copies (preview only) travel as
// they are. Raw files picked from disk (the "original" Blob) never travel:
// the eBay-size copy stands in for them.

import type { ItemGroup, Photo } from "./types";

export interface PhotoRef {
  __photo: 1;
  id: string;
  mediaType: string;
  analysisSelected?: boolean;
}

export const isPhotoRef = (v: unknown): v is PhotoRef =>
  !!v && typeof v === "object" && (v as PhotoRef).__photo === 1 && typeof (v as PhotoRef).id === "string";

/** A full photo as the lister keeps it in memory and in the browser. */
export function isFullPhoto(v: unknown): v is Photo {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<Photo>;
  return (
    typeof p.id === "string" &&
    typeof p.previewUrl === "string" &&
    typeof p.mediaType === "string" &&
    typeof p.data === "string" &&
    p.data.length > 0
  );
}

const isBlobLike = (v: unknown) => typeof Blob !== "undefined" && v instanceof Blob;

/**
 * A record ready for the cloud: JSON text, plus the full photos it mentions
 * (to be sent to the photo store if they are not there yet).
 */
export function packRecord(value: unknown): { json: string; photos: Map<string, Photo> } {
  const photos = new Map<string, Photo>();
  const json = JSON.stringify(value, function (_k, v) {
    if (isBlobLike(v)) return undefined;
    if (isFullPhoto(v)) {
      photos.set(v.id, v);
      const ref: PhotoRef = { __photo: 1, id: v.id, mediaType: v.mediaType };
      if (v.analysisSelected !== undefined) ref.analysisSelected = v.analysisSelected;
      return ref;
    }
    return v;
  });
  return { json: json ?? "null", photos };
}

/** Every photo id a packed record refers to. */
export function refsIn(json: string): string[] {
  const out = new Set<string>();
  JSON.parse(json, (_k, v) => {
    if (isPhotoRef(v)) out.add(v.id);
    return v;
  });
  return [...out];
}

/** A record from the cloud, with each photo reference replaced by its photo. */
export function unpackRecord(json: string, photo: (ref: PhotoRef) => Photo | undefined): unknown {
  return JSON.parse(json, (_k, v) => {
    if (isPhotoRef(v)) {
      const p = photo(v);
      if (!p) return v; // kept as a reference; the caller decides
      return v.analysisSelected === undefined ? p : { ...p, analysisSelected: v.analysisSelected };
    }
    return v;
  });
}

/** A short fingerprint of a packed record, to skip sending what did not change. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${s.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

/** Revisions are "<ms>" for a record, "-<ms>" for a deleted one. */
export const revTime = (rev: string | undefined) => (rev ? Math.abs(Number(rev)) || 0 : 0);
export const revDeleted = (rev: string | undefined) => !!rev && rev.startsWith("-");

interface WorkScreen {
  version: 1;
  photos: unknown[];
  groups: ItemGroup[];
  orphanIds: string[];
  updatedAt: number;
  [k: string]: unknown;
}

export const isWorkScreen = (v: unknown): v is WorkScreen =>
  !!v &&
  typeof v === "object" &&
  (v as WorkScreen).version === 1 &&
  Array.isArray((v as WorkScreen).photos) &&
  Array.isArray((v as WorkScreen).groups);

/**
 * Two work screens that both changed — this browser's and the cloud's (two
 * Chrome profiles brought together, or two devices at once). Nothing is
 * dropped: every item and photo of both is kept; for an item on both, the
 * newer screen's copy wins.
 */
/** A work screen with no photos and no items — a fresh browser's, or a cleared one. */
export const isEmptyWorkScreen = (v: unknown): boolean =>
  isWorkScreen(v) && v.photos.length === 0 && v.groups.length === 0;

export function mergeWorkScreens(local: unknown, remote: unknown): unknown {
  if (!isWorkScreen(local)) return remote;
  if (!isWorkScreen(remote)) return local;
  // An empty screen brings nothing: the other one stays exactly as it is
  // (11 Nov 2026: a new browser's empty screen wiped the cloud's).
  if (isEmptyWorkScreen(local)) return remote;
  if (isEmptyWorkScreen(remote)) return local;
  const [older, newer] =
    (local.updatedAt ?? 0) > (remote.updatedAt ?? 0) ? [remote, local] : [local, remote];
  const photoId = (p: unknown) => (p && typeof p === "object" ? String((p as { id?: unknown }).id ?? "") : "");
  const photos = new Map<string, unknown>();
  for (const p of [...older.photos, ...newer.photos]) if (photoId(p)) photos.set(photoId(p), p);
  const groups = new Map<string, ItemGroup>();
  for (const g of [...older.groups, ...newer.groups]) groups.set(g.id, g);
  const used = new Set([...groups.values()].flatMap((g) => g.photoIds));
  const orphans = new Set([...older.orphanIds, ...newer.orphanIds].filter((id) => !used.has(id)));
  // Two screens on different steps: show the cards when either had cards.
  const step = [older.step, newer.step].includes("listings") ? "listings" : newer.step;
  return {
    ...newer,
    photos: [...photos.values()],
    groups: [...groups.values()],
    orphanIds: [...orphans],
    step,
    updatedAt: Math.max(older.updatedAt ?? 0, newer.updatedAt ?? 0),
  };
}

/** Text → bytes for a photo's base64 copy. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
