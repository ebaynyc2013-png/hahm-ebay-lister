// Where a detail is — checked against the photos it is seen on (the seller's
// rule of 1 Nov 2026). The analysis says which side each photo shows and on
// which photos each placed detail is seen; when every one of those photos is
// a back view, a "side" or "front" in the text becomes "back" (and likewise
// for front and side views). The Prada trousers: tape on the back panels,
// seen on photos 3 and 5 (both back views), went out as "Side Tape Trim".

import type { ListingResult } from "./types";

type Place = "front" | "back" | "side";
export interface PhotoView {
  photo: number;
  view: string;
}
export interface DetailPlace {
  detail: string;
  place: string;
  photos: number[];
}

const PLACES: Place[] = ["front", "back", "side"];
const STOP = new Set(["the", "a", "an", "and", "of", "on", "with", "front", "back", "side", "both", "legs", "leg"]);

function sameCase(word: string, like: string): string {
  if (like === like.toUpperCase()) return word.toUpperCase();
  if (like[0] === like[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/** The place the photos show, when they all agree; null otherwise. */
export function placeFromViews(photos: number[], views: PhotoView[]): Place | null {
  const seen = photos
    .map((p) => views.find((v) => v.photo === p)?.view)
    .filter((v): v is string => Boolean(v));
  const placed = seen.filter((v): v is Place => (PLACES as string[]).includes(v));
  if (!placed.length) return null;
  return placed.every((v) => v === placed[0]) ? placed[0] : null;
}

/** "side tape trim" → "back tape trim" in one piece of text, for this detail's own words. */
export function movePlace(text: string, detail: string, from: Place, to: Place): string {
  const words = detail
    .toLowerCase()
    .split(/[^a-z-]+/)
    .filter((w) => w && !STOP.has(w));
  const head = words[words.length - 1];
  if (!head) return text;
  const re = new RegExp(String.raw`\b(${from})\b((?:[\s-]+[A-Za-z-]+){0,2}?[\s-]+${head}s?)\b`, "gi");
  return text.replace(re, (_m, place: string, rest: string) => `${sameCase(to, place)}${rest}`);
}

/** Correct every placed detail whose photos all show another side. Returns what changed. */
export function fixDetailPlaces(
  l: ListingResult,
  views: unknown,
  details: unknown,
): string[] {
  const v = (Array.isArray(views) ? views : []) as PhotoView[];
  const d = (Array.isArray(details) ? details : []) as DetailPlace[];
  const changed: string[] = [];
  for (const item of d) {
    const said = String(item?.place ?? "") as Place;
    if (!(PLACES as string[]).includes(said) || !Array.isArray(item?.photos)) continue;
    const shown = placeFromViews(item.photos, v);
    if (!shown || shown === said) continue;
    const before = JSON.stringify([l.title, l.description, l.condition_notes, l.key_features]);
    l.title = movePlace(l.title, item.detail, said, shown);
    l.description = movePlace(l.description, item.detail, said, shown);
    if (l.condition_notes) l.condition_notes = movePlace(l.condition_notes, item.detail, said, shown);
    if (l.key_features) l.key_features = l.key_features.map((k) => movePlace(k, item.detail, said, shown));
    if (JSON.stringify([l.title, l.description, l.condition_notes, l.key_features]) !== before)
      changed.push(`${item.detail}: ${said} → ${shown}`);
  }
  return changed;
}
