import { beforeAll, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { setRedisForTests, K } from "@/lib/cloud/redis";
import { slotCookie, ACTIVE_COOKIE } from "@/lib/ebay/accounts";
import { sealConnection } from "@/lib/ebay/session";
import { GET as status } from "@/app/api/ebay/status/route";

// Jewelry connected in one Chrome profile, Clothing in another (11 Nov 2026):
// after each profile opens the lister once, both see both accounts.

const h = new Map<string, Map<string, string>>();
const m = (k: string) => (h.has(k) ? h.get(k)! : (h.set(k, new Map()), h.get(k)!));
const fake = {
  hgetall: async (k: string) => (h.get(k)?.size ? Object.fromEntries(h.get(k)!) : null),
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

const CODE = "test-access-code-not-real";
beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
  process.env.APP_SECRET = CODE;
  process.env.EBAY_CLIENT_ID ||= "test-client";
  process.env.EBAY_CLIENT_SECRET ||= "test-secret";
  process.env.EBAY_RU_NAME ||= "test-runame";
  setRedisForTests(fake as any);
});

const conn = (label: string) => ({
  refreshToken: `${label}-token`,
  refreshExpiresAt: Date.now() + 1e10,
  label,
});
function request(cookies: Record<string, string>, withCode = true) {
  const headers: Record<string, string> = {
    cookie: Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
  };
  if (withCode) headers["x-app-secret"] = CODE;
  return new NextRequest("http://localhost/api/ebay/status", { headers });
}

it("every profile ends up with every account; tokens never reach the page", async () => {
  const jewelry = await status(
    request({ [slotCookie(1)]: await sealConnection(conn("Jewelry")), [ACTIVE_COOKIE]: "1" }),
  );
  const j = await jewelry.json();
  expect(j.cloud).toBe(true);
  expect(j.accounts.map((a: any) => a.label)).toEqual(["Jewelry"]);
  // The browser's own copy is taken back: the cloud holds the one copy.
  expect(jewelry.cookies.get(slotCookie(1))?.value).toBe("");

  const clothing = await status(
    request({ [slotCookie(1)]: await sealConnection(conn("Clothing")), [ACTIVE_COOKIE]: "1" }),
  );
  const c = await clothing.json();
  expect(c.accounts.map((a: any) => a.label).sort()).toEqual(["Clothing", "Jewelry"]);
  expect(c.activeLabel).toBe("Clothing"); // each profile keeps its own active account
  expect(JSON.stringify(c)).not.toContain("token");

  // A third, empty profile sees both.
  const fresh = await (await status(request({}))).json();
  expect(fresh.accounts.map((a: any) => a.label).sort()).toEqual(["Clothing", "Jewelry"]);
  expect(h.get(K.ebay)!.size).toBe(2);

  // Without the access code: only this browser's own cookies, nothing from the cloud.
  const stranger = await (await status(request({}, false))).json();
  expect(stranger.accounts).toEqual([]);
  expect(stranger.cloud).toBe(false);
});
