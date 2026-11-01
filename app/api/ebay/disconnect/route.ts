import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-guard";
import { EBAY_COOKIE } from "@/lib/ebay/session";
import {
  ACTIVE_COOKIE,
  COOKIE_OPTIONS,
  activeSlotOf,
  listAccounts,
  slotCookie,
} from "@/lib/ebay/accounts";

export const dynamic = "force-dynamic";

// Forget one eBay account — the active one unless another is named. Another
// connected account, if any, becomes active.
export async function POST(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;

  let slot: number | null = null;
  try {
    const body = await req.json();
    if (Number.isInteger(body?.slot)) slot = body.slot;
  } catch {
    /* no body: the active account */
  }
  const accounts = await listAccounts(req.cookies);
  const active = activeSlotOf(req.cookies, accounts);
  const gone = slot ?? active;
  const res = NextResponse.json({ ok: true });
  if (gone) res.cookies.delete(slotCookie(gone));
  res.cookies.delete(EBAY_COOKIE);
  const rest = accounts.filter((a) => a.slot !== gone);
  if (gone === active || !active) {
    if (rest.length) res.cookies.set(ACTIVE_COOKIE, String(rest[0].slot), COOKIE_OPTIONS);
    else res.cookies.delete(ACTIVE_COOKIE);
  }
  return res;
}
