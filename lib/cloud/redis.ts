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
