import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { setRedisForTests, K } from "@/lib/cloud/redis";
import * as recordsRoute from "@/app/api/cloud/records/route";
import * as photoRoute from "@/app/api/cloud/photo/route";
import { mergeWorkScreens, packRecord, refsIn, unpackRecord } from "@/lib/cloud-records";

// Two Chrome profiles (Jewelry in one, Clothing in the other) meeting through
// the cloud — the seller's request of 11 Nov 2026. Everything real except the
// two stores, which are kept in memory here.

const blobs = new Map<string, Uint8Array>();
vi.mock("@vercel/blob", () => ({
  put: async (path: string, body: Buffer) => {
    blobs.set(path, new Uint8Array(body));
    return { pathname: path };
  },
  get: async (path: string) => {
    const b = blobs.get(path);
    return b ? { stream: new Blob([b as BlobPart]).stream() } : null;
  },
  del: async (paths: string[]) => paths.forEach((p) => blobs.delete(p)),
}));
vi.mock("@/lib/resize", () => ({
  derivedCopies: async () => ({ data: "ZGVyaXZlZA==", previewUrl: "data:image/jpeg;base64,c21hbGw=" }),
}));

class FakeRedis {
  h = new Map<string, Map<string, string>>();
  private m(k: string) {
    if (!this.h.has(k)) this.h.set(k, new Map());
    return this.h.get(k)!;
  }
  async hgetall(k: string) {
    const m = this.h.get(k);
    return m && m.size ? Object.fromEntries(m) : null;
  }
  async hmget(k: string, ...f: string[]) {
    return Object.fromEntries(f.map((x) => [x, this.h.get(k)?.get(x) ?? null]));
  }
  async hset(k: string, o: Record<string, string>) {
    for (const [a, b] of Object.entries(o)) this.m(k).set(a, b);
    return Object.keys(o).length;
  }
  async hdel(k: string, ...f: string[]) {
    f.forEach((x) => this.m(k).delete(x));
    return f.length;
  }
  pipeline() {
    const ops: (() => Promise<unknown>)[] = [];
    const p = {
      hset: (k: string, o: Record<string, string>) => (ops.push(() => this.hset(k, o)), p),
      hdel: (k: string, ...f: string[]) => (ops.push(() => this.hdel(k, ...f)), p),
      exec: async () => {
        const out = [];
        for (const o of ops) out.push(await o());
        return out;
      },
    };
    return p;
  }
}
const store = new FakeRedis();

const CODE = "test-access-code-not-real";

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

interface Browser {
  idb: IDBFactory;
  ls: Storage;
  sync: typeof import("@/lib/cloud-sync");
  drafts: typeof import("@/lib/draft-store");
}

let current: Browser | null = null;
function use(b: Browser) {
  current = b;
  (globalThis as any).indexedDB = b.idb;
  (globalThis as any).localStorage = b.ls;
  (globalThis as any).window = globalThis;
}
async function browser(): Promise<Browser> {
  vi.resetModules();
  const b = { idb: new IDBFactory(), ls: fakeStorage() } as Browser;
  use(b);
  b.ls.setItem("listing-writer:access-code", CODE);
  b.sync = await import("@/lib/cloud-sync");
  b.drafts = await import("@/lib/draft-store");
  return b;
}

const b64 = (s: string) => Buffer.from(s).toString("base64");
const photo = (id: string, big: string) => ({
  id,
  mediaType: "image/jpeg",
  data: b64(`analysis-${id}`),
  uploadData: b64(big),
  previewUrl: `data:image/jpeg;base64,${b64("p")}`,
});
const draft = (photos: any[], groups: any[], updatedAt: number) => ({
  version: 1 as const,
  photos,
  groups,
  orphanIds: [],
  binPrefix: "B",
  skuStart: 0,
  step: "listings" as const,
  updatedAt,
});
const group = (id: string, photoId: string) => ({
  id,
  sku: id,
  name: id,
  photoIds: [photoId],
  status: "done",
  listing: { title: `Title ${id}`, description: "d" },
});

async function putKey(b: Browser, key: string, value: unknown) {
  use(b);
  const db = await b.drafts.openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function delKey(b: Browser, key: string) {
  use(b);
  const db = await b.drafts.openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function getKey(b: Browser, key: string) {
  use(b);
  const db = await b.drafts.openRawDb();
  const v = await new Promise((res) => {
    const r = db.transaction("workspace").objectStore("workspace").get(key);
    r.onsuccess = () => res(r.result);
  });
  db.close();
  return v as any;
}

beforeAll(() => {
  process.env.APP_SECRET = CODE;
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  process.env.BLOB_STORE_ID = "store_fake";
  setRedisForTests(store as any);
  (globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
    const req = new NextRequest(new URL(url, "http://localhost"), init as any);
    const p = req.nextUrl.pathname;
    const method = (init.method ?? "GET").toUpperCase();
    if (p === "/api/cloud/records") return recordsRoute.POST(req);
    if (p === "/api/cloud/photo") return (photoRoute as any)[method](req);
    throw new Error(`unexpected ${p}`);
  };
});

describe("records", () => {
  it("photos travel as references; Blobs never travel", () => {
    const p = { ...photo("abc123", "BIG"), original: new Blob(["raw"]) };
    const { json, photos } = packRecord(draft([p], [group("g", "abc123")], 1));
    expect(json).not.toContain(b64("BIG"));
    expect(json).not.toContain("original");
    expect([...photos.keys()]).toEqual(["abc123"]);
    expect(refsIn(json)).toEqual(["abc123"]);
    const back = unpackRecord(json, () => p) as any;
    expect(back.photos[0].uploadData).toBe(b64("BIG"));
  });

  it("two work screens merge without losing an item", () => {
    const a = draft([photo("pa0001", "A")], [group("ga", "pa0001")], 10);
    const b = draft([photo("pb0001", "B")], [group("gb", "pb0001")], 20);
    const m = mergeWorkScreens(a, b) as any;
    expect(m.groups.map((g: any) => g.id).sort()).toEqual(["ga", "gb"]);
    expect(m.photos.map((p: any) => p.id).sort()).toEqual(["pa0001", "pb0001"]);
  });
});

describe("two Chrome profiles through the cloud", () => {
  it("joins, merges, carries photos and deletions both ways", async () => {
    const jewelry = await browser();
    await jewelry.drafts.saveDraft(draft([photo("pa0001", "BIG-A")], [group("ga", "pa0001")], 10));
    await putKey(jewelry, "brandmark:tiffany", { name: "Tiffany" });
    use(jewelry);
    await jewelry.sync.pull();
    expect(await jewelry.sync.push()).toBeGreaterThan(0);
    expect(blobs.has("olya/p/pa0001.jpg")).toBe(true);
    expect(store.h.get(K.rec)!.get("current")).not.toContain(b64("BIG-A"));

    const clothing = await browser();
    await clothing.drafts.saveDraft(draft([photo("pb0001", "BIG-B")], [group("gb", "pb0001")], 20));
    use(clothing);
    await clothing.sync.pull();
    let screen = await clothing.drafts.loadDraft();
    expect(screen!.groups.map((g) => g.id).sort()).toEqual(["ga", "gb"]);
    const pa = screen!.photos.find((p) => p.id === "pa0001")!;
    expect(pa.uploadData).toBe(b64("BIG-A")); // the eBay-size copy came back
    expect(pa.data).toBeTruthy();
    expect((await getKey(clothing, "brandmark:tiffany")).name).toBe("Tiffany");
    use(clothing);
    await clothing.sync.push();
    expect(blobs.has("olya/p/pb0001.jpg")).toBe(true);

    // Back in the first profile: the clothing item is there too.
    use(jewelry);
    expect(await jewelry.sync.pull()).toBeGreaterThan(0);
    screen = await jewelry.drafts.loadDraft();
    expect(screen!.groups.map((g) => g.id).sort()).toEqual(["ga", "gb"]);

    // A learned mark deleted in one profile is gone from the other.
    await delKey(jewelry, "brandmark:tiffany");
    use(jewelry);
    await jewelry.sync.push();
    use(clothing);
    await clothing.sync.pull();
    expect(await getKey(clothing, "brandmark:tiffany")).toBeUndefined();

    // Nothing new: nothing is sent again.
    use(jewelry);
    expect(await jewelry.sync.push()).toBe(0);
  });

  it("refuses without the access code", async () => {
    const res = await recordsRoute.POST(
      new NextRequest("http://localhost/api/cloud/records", {
        method: "POST",
        body: JSON.stringify({ action: "revs" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("an empty work screen never wipes another (11 Nov 2026)", () => {
  it("a new browser's empty screen is merged, not sent over the cloud's", async () => {
    store.h.clear();
    blobs.clear();
    const jewelry = await browser();
    await jewelry.drafts.saveDraft(draft([photo("pa0002", "BIG-A")], [group("ga2", "pa0002")], 10));
    use(jewelry);
    await jewelry.sync.push();

    const edge = await browser();
    // The page opened before the cloud arrived and saved its empty screen.
    await edge.drafts.saveDraft(draft([], [], Date.now()));
    use(edge);
    await edge.sync.push();
    const cloud = JSON.parse(store.h.get(K.rec)!.get("current")!);
    expect(cloud.groups.map((g: any) => g.id)).toEqual(["ga2"]);
    use(edge);
    expect((await edge.drafts.loadDraft())!.groups.map((g) => g.id)).toEqual(["ga2"]);
  });

  it("an empty screen already in the cloud is replaced by the work here", async () => {
    store.h.clear();
    blobs.clear();
    const jewelry = await browser();
    await jewelry.drafts.saveDraft(draft([photo("pa0003", "BIG-A")], [group("ga3", "pa0003")], 10));
    use(jewelry);
    await jewelry.sync.push();
    // Someone sent an empty screen (the bug of 11 Nov).
    store.h.get(K.rec)!.set("current", packRecord(draft([], [], Date.now())).json);
    store.h.get(K.rev)!.set("current", String(Date.now() + 1000));

    use(jewelry);
    await jewelry.sync.pull();
    expect((await jewelry.drafts.loadDraft())!.groups.map((g) => g.id)).toEqual(["ga3"]);
    use(jewelry);
    await jewelry.sync.push();
    const cloud = JSON.parse(store.h.get(K.rec)!.get("current")!);
    expect(cloud.groups.map((g: any) => g.id)).toEqual(["ga3"]);
  });
});

describe("a screen that saves an old empty copy after the cloud's arrived", () => {
  it("never sends it, and gets the cloud's screen back", async () => {
    store.h.clear();
    blobs.clear();
    const chrome = await browser();
    await chrome.drafts.saveDraft(draft([photo("pa0004", "BIG-A")], [group("ga4", "pa0004")], 10));
    use(chrome);
    await chrome.sync.push();

    const edge = await browser();
    use(edge);
    await edge.sync.pull(); // the cloud's screen arrives
    await edge.drafts.saveDraft(draft([], [], Date.now())); // the page saves its stale empty copy
    use(edge);
    await edge.sync.push();
    const cloud = JSON.parse(store.h.get(K.rec)!.get("current")!);
    expect(cloud.groups.map((g: any) => g.id)).toEqual(["ga4"]);
    use(edge);
    expect((await edge.drafts.loadDraft())!.groups.map((g) => g.id)).toEqual(["ga4"]);
  });
});
