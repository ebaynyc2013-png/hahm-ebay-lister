// The first AI step only tells what kind of thing an item is (clothing, home
// goods, art, media, collectibles). It needs the shape, not the tags, so it
// can look at the small on-screen copies (~360px) instead of the full photos
// (~1024px) — about a sixth of the cost for that step. Every other step keeps
// the full photos.
//
// The small copies ride along in the same request as the full photos, so they
// are only sent when the whole request stays well under Vercel's 4.5 MB body
// limit. Whenever anything doesn't fit or doesn't match, nothing is sent and the
// server falls back to the full photos, exactly as before.

const SMALL_BUDGET = 800_000; // same cap as routerImagesSchema
const REQUEST_BUDGET = 4_000_000; // headroom under Vercel's 4.5 MB

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

export interface SmallCopySource {
  previewUrl: string;
}

export interface ImagePart {
  mediaType: string;
  data: string;
}

export function smallCopiesForRouting(
  photos: readonly SmallCopySource[],
  fullImages: readonly ImagePart[],
  references: readonly { image?: { data: string } }[] = [],
): ImagePart[] | undefined {
  if (photos.length === 0 || photos.length !== fullImages.length) return undefined;
  const small: ImagePart[] = [];
  for (const p of photos) {
    const m = DATA_URL.exec(p.previewUrl ?? "");
    if (!m) return undefined;
    small.push({ mediaType: m[1], data: m[2] });
  }
  const smallTotal = small.reduce((n, x) => n + x.data.length, 0);
  if (smallTotal >= SMALL_BUDGET) return undefined;
  const fullTotal = fullImages.reduce((n, x) => n + x.data.length, 0);
  const refTotal = references.reduce((n, r) => n + (r.image?.data.length ?? 0), 0);
  if (fullTotal + refTotal + smallTotal >= REQUEST_BUDGET) return undefined;
  return small;
}
