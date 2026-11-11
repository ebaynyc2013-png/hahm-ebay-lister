import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { setRedisForTests, K } from "@/lib/cloud/redis";
import * as recordsRoute from "@/app/api/cloud/records/route";
import * as photoRoute from "@/app/api/cloud/photo/route";

const blobs = new Map<string, Uint8Array>();
vi.mock("@vercel/blob", () => ({
  put: async (path: string, body: Buffer) => void blobs.set(path, new Uint8Array(body)),
  get: async (path: string) => {
    const b = blobs.get(path);
    return b ? { stream: new Blob([b as BlobPart]).stream() } : null;
  },
  del: async (paths: string[]) => paths.forEach((p) => blobs.delete(p)),
}));
vi.mock("@/lib/resize", () => ({
  derivedCopies: async () => ({ data: "ZGVyaXZlZA==", previewUrl: "data:image/jpeg;base64,c21hbGw=" }),
}));
const h = new Map<string, Map<string, string>>();
const m = (k: string) => (h.has(k) ? h.get(k)! : (h.set(k, new Map()), h.get(k)!));
const fake = {
  hgetall: async (k: string) => (h.get(k)?.size ? [...h.get(k)!].flat() : []),
  hget: async (k: string, f: string) => h.get(k)?.get(f) ?? null,
  hmget: async (k: string, ...f: string[]) => f.map((x) => h.get(k)?.get(x) ?? null),
  hset: async (k: string, o: Record<string, string>) => {
    for (const [a, b] of Object.entries(o)) m(k).set(a, b);
  },
  hdel: async (k: string, ...f: string[]) => f.forEach((x) => m(k).delete(x)),
  pipeline() {
    const ops: (() => Promise<unknown>)[] = [];
    const p = {
      hset: (k: string, o: Record<string, string>) => (ops.push(() => fake.hset(k, o)), p),
      hdel: (k: string, ...f: string[]) => (ops.push(() => fake.hdel(k, ...f)), p),
      exec: async () => {
        for (const o of ops) await o();
      },
    };
    return p;
  },
};
const CODE = "test-code";
const ls = () => {
  const s = new Map<string, string>();
  return { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => void s.set(k, v), removeItem: (k: string) => void s.delete(k) } as unknown as Storage;
};
async function browser() {
  vi.resetModules();
  const b: any = { idb: new IDBFactory(), ls: ls() };
  use(b);
  b.ls.setItem("listing-writer:access-code", CODE);
  b.sync = await import("@/lib/cloud-sync");
  b.drafts = await import("@/lib/draft-store");
  return b;
}
function use(b: any) {
  (globalThis as any).indexedDB = b.idb;
  (globalThis as any).localStorage = b.ls;
  (globalThis as any).window = globalThis;
}
const b64 = (s: string) => Buffer.from(s).toString("base64");
const full = (t: number) => ({
  version: 1 as const,
  photos: [{ id: "px00001", mediaType: "image/jpeg", data: b64("a"), uploadData: b64("A"), previewUrl: "data:x" }],
  groups: [{ id: "g1", sku: "s", name: "n", photoIds: ["px00001"], status: "done" }],
  orphanIds: [], binPrefix: "B", skuStart: 3, step: "listings" as const, updatedAt: t,
});
const empty = (t: number) => ({ version: 1 as const, photos: [], groups: [], orphanIds: [], binPrefix: "", skuStart: 0, step: "upload" as const, updatedAt: t });
const cloudGroups = () => JSON.parse(h.get(K.rec)!.get("current")!).groups.length;

beforeAll(() => {
  process.env.APP_SECRET = CODE;
  process.env.UPSTASH_REDIS_REST_URL = "https://x";
  process.env.UPSTASH_REDIS_REST_TOKEN = "x";
  process.env.BLOB_STORE_ID = "x";
  setRedisForTests(fake as any);
  (globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
    const req = new NextRequest(new URL(url, "http://localhost"), init as any);
    if (req.nextUrl.pathname === "/api/cloud/records") return recordsRoute.POST(req);
    return (photoRoute as any)[(init.method ?? "GET").toUpperCase()](req);
  };
});

it("Edge's real sequence of 11 Nov: empty pushed earlier, Chrome healed, Edge reopens", async () => {
  const chrome = await browser();
  await chrome.drafts.saveDraft(full(1));
  use(chrome); await chrome.sync.push();
  const edge = await browser();
  use(edge); await edge.sync.pull();
  // Old Edge sent an empty screen.
  await edge.drafts.saveDraft(empty(2));
  // (simulate the old code: force it into the cloud)
  h.get(K.rec)!.set("current", JSON.stringify(empty(2)));
  h.get(K.rev)!.set("current", String(Date.now()));
  await new Promise((r) => setTimeout(r, 20));
  use(edge); await edge.sync.pull(); // Edge takes the empty one as its own
  // Chrome heals.
  use(chrome); await chrome.sync.pull(); await chrome.sync.push();
  expect(cloudGroups()).toBe(1);
  // Edge reopens: the page saves its empty screen before the cloud arrives.
  use(edge); await edge.drafts.saveDraft(empty(3));
  use(edge); await edge.sync.pull(); await edge.sync.push();
  expect(cloudGroups()).toBe(1);
  use(edge); expect((await edge.drafts.loadDraft()).groups.length).toBe(1);
});
