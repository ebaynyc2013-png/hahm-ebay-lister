// Several eBay accounts, one active — the seller's request of 1 Nov 2026:
// jewelry is posted to one account, clothing to another.
//
// Each account is its own encrypted, httpOnly cookie (ebay_acct_1 …), holding
// only that account's refresh token and the name she gave it. A small cookie
// says which one is active. Nothing readable reaches the browser, and the
// program's eBay keys stay the same for every account: each account owner
// signs in on eBay's own page and agrees there.
//
// Before this, one account lived in "ebay_conn". It is still read, and moved
// into slot 1 as "Account 1" the first time the status is checked, so the
// connection she already has keeps working.

import type { NextResponse } from "next/server";
import {
  EBAY_COOKIE,
  EBAY_COOKIE_MAX_AGE,
  openConnection,
  sealConnection,
  type Connection,
} from "./session";

export const MAX_ACCOUNTS = 4;
export const ACTIVE_COOKIE = "ebay_active";
export const LABEL_COOKIE = "ebay_oauth_label";
export const slotCookie = (n: number) => `ebay_acct_${n}`;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: EBAY_COOKIE_MAX_AGE,
};

type Jar = { get(name: string): { value: string } | undefined };

export interface Account {
  slot: number;
  label: string;
  sealed: string;
}

/** A name for an account: plain text, 30 characters at most. */
export function cleanLabel(raw: unknown, fallback = ""): string {
  const s = String(raw ?? "")
    .replace(/[^\p{L}\p{N} .,&'()\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30)
    .trim();
  return s || fallback;
}

/** Every connected account, by slot. */
export async function listAccounts(jar: Jar): Promise<Account[]> {
  const out: Account[] = [];
  for (let n = 1; n <= MAX_ACCOUNTS; n++) {
    const sealed = jar.get(slotCookie(n))?.value;
    const conn = await openConnection(sealed);
    if (conn && sealed)
      out.push({ slot: n, label: cleanLabel(conn.label, `Account ${n}`), sealed });
  }
  return out;
}

/** Which slot is active: the one chosen, else the first connected. */
export function activeSlotOf(jar: Jar, accounts: Account[]): number | null {
  const chosen = Number(jar.get(ACTIVE_COOKIE)?.value);
  if (accounts.some((a) => a.slot === chosen)) return chosen;
  return accounts[0]?.slot ?? null;
}

/**
 * The active account's sealed sign-in, for minting an access token. Reads the
 * raw cookies only (no decryption); falls back to the old single cookie.
 */
export function activeSealed(jar: Jar): string | undefined {
  const chosen = Number(jar.get(ACTIVE_COOKIE)?.value);
  if (chosen >= 1 && chosen <= MAX_ACCOUNTS) {
    const v = jar.get(slotCookie(chosen))?.value;
    if (v) return v;
  }
  for (let n = 1; n <= MAX_ACCOUNTS; n++) {
    const v = jar.get(slotCookie(n))?.value;
    if (v) return v;
  }
  return jar.get(EBAY_COOKIE)?.value;
}

/**
 * The old single connection, moved into slot 1 as "Account 1". Returns the
 * accounts as they are after the move.
 */
export async function migrateLegacy(jar: Jar, res: NextResponse): Promise<Account[]> {
  const accounts = await listAccounts(jar);
  if (accounts.length) return accounts;
  const legacy = await openConnection(jar.get(EBAY_COOKIE)?.value);
  if (!legacy) return accounts;
  const label = "Account 1";
  const sealed = await sealConnection({ ...legacy, label });
  res.cookies.set(slotCookie(1), sealed, COOKIE_OPTIONS);
  res.cookies.set(ACTIVE_COOKIE, "1", COOKIE_OPTIONS);
  res.cookies.delete(EBAY_COOKIE);
  return [{ slot: 1, label, sealed }];
}

/**
 * Keep a newly connected account and make it the active one. An account with
 * the same name is replaced (reconnecting "Jewelry" updates "Jewelry").
 */
export async function saveAccount(
  jar: Jar,
  res: NextResponse,
  conn: Connection,
  rawLabel: unknown,
): Promise<{ slot: number; label: string }> {
  const accounts = await migrateLegacy(jar, res);
  const free = () => {
    for (let n = 1; n <= MAX_ACCOUNTS; n++)
      if (!accounts.some((a) => a.slot === n)) return n;
    return null;
  };
  const wanted = cleanLabel(rawLabel);
  const same = wanted
    ? accounts.find((a) => a.label.toLowerCase() === wanted.toLowerCase())
    : undefined;
  const slot = same?.slot ?? free();
  if (!slot)
    throw new Error(
      `Up to ${MAX_ACCOUNTS} eBay accounts can be connected. Disconnect one first.`,
    );
  const label = wanted || `Account ${slot}`;
  res.cookies.set(slotCookie(slot), await sealConnection({ ...conn, label }), COOKIE_OPTIONS);
  res.cookies.set(ACTIVE_COOKIE, String(slot), COOKIE_OPTIONS);
  return { slot, label };
}

/** The accounts as the screen sees them: names and which is active, never tokens. */
export function publicAccounts(accounts: Account[], active: number | null) {
  return accounts.map((a) => ({ slot: a.slot, label: a.label, active: a.slot === active }));
}
