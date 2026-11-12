// Fields answered by the seller's note or a screenshot — measurements, Leg
// Style, Rise — must reach eBay even when the model forgets to say which photo
// it read them from (1 Nov 2026: Prada trousers lost Leg Style "Straight",
// Inseam 27 in, Waist Size 28 in and Rise "Mid" to "no photo cited", while
// every one of them stood on her note and in the description written from it).
//
// The check is against the listing's own text, which the analysis wrote from
// the photos and the note: a measurement must be one of its measurement lines
// (a flat waist, hip or chest doubled, as eBay's sizes are around the body); a
// bucket such as "Mid (8.5-10.5 in)" must contain the measured number; a word
// from eBay's own closed list (Straight) must appear in the title or text.

import { choosableFromPhoto, type AspectShape } from "./photo-facts";

interface Text {
  title?: string;
  description?: string;
  measurements?: string;
}

const STOP = new Set(["size", "length", "type", "style", "the", "of"]);
// What a line may be called for each kind of measurement.
const SYNONYMS: Record<string, string[]> = {
  waist: ["waist"],
  inseam: ["inseam", "inside leg"],
  rise: ["rise"],
  chest: ["chest", "bust", "pit to pit", "pit-to-pit", "armpit", "pit"],
  bust: ["bust", "chest", "pit to pit", "pit-to-pit", "armpit", "pit"],
  hip: ["hip", "hips"],
  thigh: ["thigh"],
};
// Measured flat across, sold around: doubled.
const AROUND = new Set(["waist", "chest", "bust", "hip"]);

function keyOf(aspect: string): string {
  const words = aspect.toLowerCase().split(/[^a-z]+/).filter((w) => w && !STOP.has(w));
  return words[0] ?? "";
}

function measurementLines(t: Text): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  const text = `${t.description ?? ""}\n${t.measurements ?? ""}`;
  for (const line of text.split(/\n|;/)) {
    const m = line.match(/^\s*(?:[•*-]\s*)?([A-Za-z][A-Za-z /-]{1,30}?)\s*[:\-–]\s*(?:approximately|approx\.?|about)?\s*(\d+(?:\.\d+)?)\s*(?:in\b|inch|inches|"|”)?/i);
    if (m) out.push({ label: m[1].toLowerCase().trim(), n: Number(m[2]) });
  }
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

function inBucket(value: string, n: number): boolean | null {
  const range = value.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (range) return n >= Number(range[1]) && n <= Number(range[2]);
  const less = value.match(/less than\s*(\d+(?:\.\d+)?)/i);
  if (less) return n < Number(less[1]);
  const more = value.match(/(?:greater|more) than\s*(\d+(?:\.\d+)?)/i);
  if (more) return n > Number(more[1]);
  return null;
}

/** Is this value for this eBay field what the listing's own text, from her note and photos, says? */
export function sellerTextSupports(value: string, aspect: AspectShape, t: Text): boolean {
  const v = String(value ?? "").trim();
  if (!v || v.includes(" | ")) return false;
  const key = keyOf(aspect.name);
  const names = [...(SYNONYMS[key] ?? (key ? [key] : []))];
  // "Item Length", "Necklace Length", "Item Width": a line named for the
  // dimension answers it ("Length: Approximately 1.5 in", 12 Nov 2026).
  const dim = aspect.name.toLowerCase().match(/\b(length|width|height|depth|diameter|drop)\b/);
  if (dim && !names.includes(dim[1])) names.push(dim[1]);
  const lines = measurementLines(t).filter((l) => names.some((n) => l.label.includes(n)));

  const single = v.match(/^(\d+(?:\.\d+)?)\s*(?:in|inch|inches|"|”)?$/i);
  if (single) {
    const want = Number(single[1]);
    return lines.some((l) => close(l.n, want) || (AROUND.has(key) && close(l.n * 2, want)));
  }
  if (lines.length) {
    const bucket = lines.map((l) => inBucket(v, l.n)).find((b) => b !== null);
    if (bucket !== undefined) return bucket;
  }
  // A word from eBay's own closed list, found in the listing's text.
  if (!choosableFromPhoto(aspect)) return false;
  if (!aspect.values.some((x) => x.toLowerCase() === v.toLowerCase())) return false;
  const hay = ` ${`${t.title ?? ""} ${t.description ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const needle = ` ${v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  return hay.includes(needle);
}

const words = (v: string) =>
  ` ${String(v ?? "").toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim()} `;

/**
 * A fact taken from what the seller typed in the item's Notes box (12 Nov
 * 2026): no photo to cite, so the check is her own words. The quote must be
 * in her notes, and the value in the quote — or, for a measurement, its
 * number.
 */
export function notesSupport(
  fact: { value?: unknown; quote?: unknown } | null | undefined,
  notes: string | undefined,
): boolean {
  const n = String(notes ?? "").trim();
  const quote = String(fact?.quote ?? "").trim();
  const value = String(fact?.value ?? "").trim();
  if (!n || !quote || !value) return false;
  if (!words(n).includes(words(quote))) return false;
  return value.split(" | ").every((v) => {
    if (words(quote).includes(words(v))) return true;
    const num = v.match(/^\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|cm|mm|g|oz)?\s*$/i);
    return num ? words(quote).includes(` ${num[1]} `) || quote.includes(num[1]) : false;
  });
}

/**
 * A value whose own words she wrote in the Notes box ("patchwork denim" →
 * Denim; "100 cotton" → Cotton). Words of three letters or more, whole words.
 */
export function valueInNotes(value: string, notes: string | undefined): boolean {
  const n = words(String(notes ?? ""));
  const v = String(value ?? "").trim();
  if (n.trim() === "" || !v || v.includes(" | ")) return false;
  const tokens = words(v).trim().split(" ").filter((t) => t.length >= 3);
  return tokens.length > 0 && tokens.every((t) => n.includes(` ${t} `));
}
