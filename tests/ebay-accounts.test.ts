import { beforeAll, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  ACTIVE_COOKIE,
  activeSealed,
  activeSlotOf,
  cleanLabel,
  listAccounts,
  migrateLegacy,
  publicAccounts,
  saveAccount,
  slotCookie,
} from "@/lib/ebay/accounts";
import { EBAY_COOKIE, openConnection, sealConnection } from "@/lib/ebay/session";
import { buildAuthorizeUrl } from "@/lib/ebay/oauth";

// Several eBay accounts, one active (1 Nov 2026: jewelry and clothing).
beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
  process.env.EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID || "test-client";
  process.env.EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "test-secret";
  process.env.EBAY_RU_NAME = process.env.EBAY_RU_NAME || "test-runame";
});

const jarOf = (cookies: Record<string, string>) => ({
  get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined),
});
/** The cookies a response sets, applied on top of what the browser had. */
function after(before: Record<string, string>, res: NextResponse): Record<string, string> {
  const next = { ...before };
  for (const c of res.cookies.getAll()) {
    if (!c.value) delete next[c.name];
    else next[c.name] = c.value;
  }
  return next;
}
const conn = (token: string) => ({ refreshToken: token, refreshExpiresAt: Date.now() + 1e9 });

describe("account names", () => {
  it("plain text, 30 characters at most, Russian too", () => {
    expect(cleanLabel("  Jewelry  ")).toBe("Jewelry");
    expect(cleanLabel("Одежда")).toBe("Одежда");
    expect(cleanLabel("<script>x</script>")).toBe("script x script");
    expect(cleanLabel("a".repeat(50)).length).toBe(30);
    expect(cleanLabel("", "Account 2")).toBe("Account 2");
  });
});

describe("the account connected before names existed", () => {
  it("becomes Account 1 and stays the active one", async () => {
    const legacy = await sealConnection(conn("old-token"));
    const res = NextResponse.json({});
    const accounts = await migrateLegacy(jarOf({ [EBAY_COOKIE]: legacy }), res);
    expect(accounts.map((a) => a.label)).toEqual(["Account 1"]);
    const jar = after({ [EBAY_COOKIE]: legacy }, res);
    expect(jar[EBAY_COOKIE]).toBeUndefined();
    expect(jar[ACTIVE_COOKIE]).toBe("1");
    expect((await openConnection(jar[slotCookie(1)]))?.refreshToken).toBe("old-token");
  });
  it("is still used before the move", async () => {
    const legacy = await sealConnection(conn("old-token"));
    expect(activeSealed(jarOf({ [EBAY_COOKIE]: legacy }))).toBe(legacy);
  });
});

describe("adding, switching and disconnecting", () => {
  it("a second account is kept beside the first and becomes active", async () => {
    let cookies: Record<string, string> = {
      [slotCookie(1)]: await sealConnection({ ...conn("jewelry-token"), label: "Jewelry" }),
      [ACTIVE_COOKIE]: "1",
    };
    const res = NextResponse.json({});
    const saved = await saveAccount(jarOf(cookies), res, conn("clothing-token"), "Clothing");
    expect(saved).toEqual({ slot: 2, label: "Clothing" });
    cookies = after(cookies, res);
    const jar = jarOf(cookies);
    const accounts = await listAccounts(jar);
    expect(publicAccounts(accounts, activeSlotOf(jar, accounts))).toEqual([
      { slot: 1, label: "Jewelry", active: false },
      { slot: 2, label: "Clothing", active: true },
    ]);
    expect((await openConnection(activeSealed(jar)))?.refreshToken).toBe("clothing-token");
    // Switching is only the small cookie: the token follows it.
    expect((await openConnection(activeSealed(jarOf({ ...cookies, [ACTIVE_COOKIE]: "1" }))))?.refreshToken).toBe(
      "jewelry-token",
    );
  });
  it("reconnecting an account by the same name replaces it, not adds", async () => {
    const cookies = {
      [slotCookie(1)]: await sealConnection({ ...conn("t1"), label: "Jewelry" }),
      [slotCookie(2)]: await sealConnection({ ...conn("t2"), label: "Clothing" }),
    };
    const res = NextResponse.json({});
    expect(await saveAccount(jarOf(cookies), res, conn("t3"), "jewelry")).toEqual({ slot: 1, label: "jewelry" });
  });
  it("no more than four", async () => {
    const cookies: Record<string, string> = {};
    for (let n = 1; n <= 4; n++) cookies[slotCookie(n)] = await sealConnection({ ...conn(`t${n}`), label: `A${n}` });
    await expect(saveAccount(jarOf(cookies), NextResponse.json({}), conn("t5"), "Fifth")).rejects.toThrow(
      /Up to 4/,
    );
  });
  it("the status never carries a token", async () => {
    const cookies = { [slotCookie(1)]: await sealConnection({ ...conn("secret-token"), label: "Jewelry" }) };
    const accounts = await listAccounts(jarOf(cookies));
    expect(JSON.stringify(publicAccounts(accounts, 1))).not.toContain("secret-token");
  });
});

describe("eBay's sign-in page", () => {
  it("always asks which account to sign in with", () => {
    expect(buildAuthorizeUrl("s")).toContain("prompt=login");
  });
});
