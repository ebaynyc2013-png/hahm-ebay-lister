import { Redis } from "@upstash/redis";
import { OWNER, redisEnv } from "./config";

let client: Redis | null | undefined;

/** The Redis client, or null when the store is not connected. */
export function redis(): Redis | null {
  if (client !== undefined) return client;
  const env = redisEnv();
  // Values are stored as JSON strings we write ourselves; no automatic parsing,
  // so a record reads back exactly as it was written.
  client = env ? new Redis({ url: env.url, token: env.token, automaticDeserialization: false }) : null;
  return client;
}

/** Test hook. */
export function setRedisForTests(r: Redis | null | undefined): void {
  client = r;
}

// Key layout (one owner for now):
//   <owner>:rec      hash  record key → JSON value (photos replaced by references)
//   <owner>:rev      hash  record key → revision ("<ms>" or "-<ms>" for deleted)
//   <owner>:photos   hash  photo id → upload time (ms), for cleaning up
//   <owner>:ebay     hash  slot "1".."4" → sealed eBay sign-in (encrypted)
export const K = {
  rec: `${OWNER}:rec`,
  rev: `${OWNER}:rev`,
  photos: `${OWNER}:photos`,
  ebay: `${OWNER}:ebay`,
};

// With automaticDeserialization off, Upstash hands back Redis's raw replies:
// HGETALL is a flat list [field, value, field, value, …] and HMGET a list of
// values in the order asked (found 11 Nov 2026: the sync read nothing back).
/** A hash as an object, whatever shape the client returned. */
export function hashObject(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}

/** HMGET's reply as { field: value | null }, whatever shape the client returned. */
export function fieldsObject(fields: string[], raw: unknown): Record<string, string | null> {
  if (Array.isArray(raw))
    return Object.fromEntries(fields.map((f, i) => [f, raw[i] == null ? null : String(raw[i])]));
  const o = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(fields.map((f) => [f, o[f] == null ? null : String(o[f])]));
}
