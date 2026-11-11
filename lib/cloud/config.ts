// Cloud storage for the lister (the seller's choice, 11 Nov 2026): the same
// cards, history, learned marks and eBay accounts in every Chrome profile and
// on every device.
//
// Two stores, because the free Vercel Blob plan allows only 2,000 writes a
// month and pauses the store for 30 days past it:
//   - Upstash Redis (free: 500,000 commands a month, 250 MB) — every small
//     record: the work screen, History cards, learned marks and tags, eBay
//     accounts. Autosave writes often, so it goes here.
//   - Vercel Blob, private — photos only, one write per photo.
//
// Either store missing → the lister works exactly as before, in this browser.

export function redisEnv(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.REDIS_REST_API_URL ||
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.REDIS_REST_API_TOKEN ||
    "";
  return url && token ? { url, token } : null;
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

/** Everything the screen needs to know: which halves of the cloud are on. */
export function cloudStatus(): { records: boolean; photos: boolean } {
  return { records: Boolean(redisEnv()), photos: blobConfigured() };
}

/**
 * All keys live under one owner, so the client site can later give every
 * seller their own space without moving the seller's data.
 */
export const OWNER = "olya";
