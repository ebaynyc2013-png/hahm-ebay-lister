// eBay accounts in the cloud (the seller's request, 11 Nov 2026): Jewelry is
// connected in one Chrome profile, Clothing in another, and she wants every
// account in every profile.
//
// Each account is still the same sealed sign-in (encrypted with
// SESSION_SECRET, never readable by the browser). Instead of only living in
// this browser's cookies, the sealed values live in the cloud, slot by slot,
// and every browser that has the access code sees the same accounts.
//
// How the routes use it, without changing their logic:
//   const jar = await ebayJar(req)          // read: cloud slots, else cookies
//   ... route code reads jar, sets cookies on res as before ...
//   await keepAccountsInCloud(req, res)     // write: slot cookies → cloud
//
// The first time a browser with its own cookie accounts comes in, those
// accounts are added to the cloud (by name: an account already there under the
// same name is kept), and the browser's slot cookies are cleared, so the cloud
// is the one copy from then on. The active account stays per browser.

import type { NextRequest, NextResponse } from "next/server";
import { hasAccessCode } from "@/lib/api-guard";
import { hashObject, K, redis } from "@/lib/cloud/redis";
import { EBAY_COOKIE, openConnection } from "./session";
import { ACTIVE_COOKIE, COOKIE_OPTIONS, MAX_ACCOUNTS, cleanLabel, slotCookie } from "./accounts";

type Jar = { get(name: string): { value: string } | undefined };

const SLOT_RE = /^ebay_acct_(\d)$/;

export interface CloudJar extends Jar {
  /** True when the accounts come from the cloud. */
  cloud: boolean;
  /** Cookie fixes to send back: this browser's old slot cookies, now in the cloud. */
  cleanup(res: NextResponse): void;
}

function plain(jar: Jar): CloudJar {
  return { get: (n) => jar.get(n), cloud: false, cleanup: () => {} };
}

/**
 * The browser's eBay accounts as the routes should see them: the cloud's,
 * with this browser's own cookie accounts merged in once.
 */
export async function ebayJar(
  req: NextRequest,
  opts: { trusted?: boolean } = {},
): Promise<CloudJar> {
  // "trusted": eBay's own redirect back after sign-in, which cannot carry the
  // access code but was started by a request that did (and is checked by the
  // one-time state cookie).
  const r = redis();
  if (!r || !(opts.trusted || hasAccessCode(req))) return plain(req.cookies);

  let slots: Record<string, string>;
  try {
    slots = hashObject(await r.hgetall(K.ebay));
  } catch {
    return plain(req.cookies); // cloud down: this browser's cookies, as before
  }

  // This browser's own accounts (and the very old single one).
  const local: { name: string; sealed: string }[] = [];
  for (let n = 1; n <= MAX_ACCOUNTS; n++) {
    const v = req.cookies.get(slotCookie(n))?.value;
    if (v) local.push({ name: slotCookie(n), sealed: v });
  }
  const legacy = req.cookies.get(EBAY_COOKIE)?.value;
  if (legacy) local.push({ name: EBAY_COOKIE, sealed: legacy });

  // Merge them in by name; a name already in the cloud keeps the cloud's.
  const cloudLabels = new Map<string, string>();
  const cloudExpiry = new Map<string, number>();
  for (const [slot, sealed] of Object.entries(slots)) {
    const c = await openConnection(sealed);
    if (!c) continue;
    cloudLabels.set(cleanLabel(c.label).toLowerCase(), slot);
    cloudExpiry.set(slot, c.refreshExpiresAt ?? 0);
  }
  const activeCookie = req.cookies.get(ACTIVE_COOKIE)?.value;
  let activeMapped: string | undefined;
  const added: Record<string, string> = {};
  const toClear: string[] = [];
  for (const acc of local) {
    const conn = await openConnection(acc.sealed);
    if (!conn) continue;
    const label = cleanLabel(conn.label).toLowerCase();
    let slot = label ? cloudLabels.get(label) : undefined;
    // Same name in both: the newer sign-in wins (a reconnect in this browser).
    if (slot && (conn.refreshExpiresAt ?? 0) > (cloudExpiry.get(slot) ?? 0)) added[slot] = acc.sealed;
    if (!slot) {
      for (let n = 1; n <= MAX_ACCOUNTS; n++)
        if (!slots[String(n)] && !added[String(n)]) {
          slot = String(n);
          break;
        }
      if (!slot) continue; // cloud full: leave this one in the browser
      added[slot] = acc.sealed;
      if (label) cloudLabels.set(label, slot);
    }
    toClear.push(acc.name);
    const m = SLOT_RE.exec(acc.name);
    if (m && m[1] === activeCookie) activeMapped = slot;
    if (acc.name === EBAY_COOKIE && !activeCookie) activeMapped = slot;
  }
  if (Object.keys(added).length) {
    try {
      await r.hset(K.ebay, added);
      Object.assign(slots, added);
    } catch {
      return plain(req.cookies);
    }
  }

  const active = activeMapped ?? activeCookie;
  return {
    cloud: true,
    get(name: string) {
      if (name === ACTIVE_COOKIE) return active ? { value: active } : undefined;
      if (name === EBAY_COOKIE) return undefined; // merged into the cloud
      const m = SLOT_RE.exec(name);
      if (m) {
        const v = slots[m[1]];
        return v ? { value: v } : undefined;
      }
      return req.cookies.get(name);
    },
    cleanup(res: NextResponse) {
      for (const name of toClear) res.cookies.delete(name);
      if (activeMapped && activeMapped !== activeCookie)
        res.cookies.set(ACTIVE_COOKIE, activeMapped, COOKIE_OPTIONS);
    },
  };
}

/**
 * After a route has set or deleted slot cookies on its response, carry those
 * changes into the cloud and take the slot cookies back out of the response.
 */
export async function keepAccountsInCloud(req: NextRequest, res: NextResponse, jar: CloudJar): Promise<void> {
  const r = redis();
  if (!r || !jar.cloud) return;
  const set: Record<string, string> = {};
  const gone: string[] = [];
  for (const c of res.cookies.getAll()) {
    const m = SLOT_RE.exec(c.name);
    if (!m) continue;
    if (c.value) set[m[1]] = c.value;
    else gone.push(m[1]);
  }
  if (!Object.keys(set).length && !gone.length) {
    jar.cleanup(res);
    return;
  }
  const p = r.pipeline();
  if (Object.keys(set).length) p.hset(K.ebay, set);
  if (gone.length) p.hdel(K.ebay, ...gone);
  await p.exec();
  for (const n of [...Object.keys(set), ...gone]) res.cookies.delete(slotCookie(Number(n)));
  jar.cleanup(res);
}
