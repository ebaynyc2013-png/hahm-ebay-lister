import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-guard";
import { sealConnection, openConnection } from "@/lib/ebay/session";
import {
  ACTIVE_COOKIE,
  COOKIE_OPTIONS,
  cleanLabel,
  listAccounts,
  slotCookie,
} from "@/lib/ebay/accounts";
import { ebayJar, keepAccountsInCloud } from "@/lib/ebay/cloud-accounts";

export const dynamic = "force-dynamic";

// Switch the active eBay account, or rename one (1 Nov 2026).
//   { action: "switch", slot }   { action: "rename", slot, label }
export async function POST(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;

  let body: { action?: string; slot?: number; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const jar = await ebayJar(req);
  const accounts = await listAccounts(jar);
  const account = accounts.find((a) => a.slot === body.slot);
  if (!account)
    return NextResponse.json(
      { ok: false, error: "That eBay account is not connected here." },
      { status: 404 },
    );

  if (body.action === "switch") {
    const res = NextResponse.json({ ok: true, label: account.label });
    res.cookies.set(ACTIVE_COOKIE, String(account.slot), COOKIE_OPTIONS);
    await keepAccountsInCloud(req, res, jar);
    return res;
  }
  if (body.action === "rename") {
    const label = cleanLabel(body.label);
    if (!label)
      return NextResponse.json({ ok: false, error: "Type a name for the account." }, { status: 400 });
    if (accounts.some((a) => a.slot !== account.slot && a.label.toLowerCase() === label.toLowerCase()))
      return NextResponse.json(
        { ok: false, error: `Another account is already called ${label}.` },
        { status: 400 },
      );
    const conn = await openConnection(account.sealed);
    if (!conn)
      return NextResponse.json({ ok: false, error: "Reconnect this account." }, { status: 400 });
    const res = NextResponse.json({ ok: true, label });
    res.cookies.set(slotCookie(account.slot), await sealConnection({ ...conn, label }), COOKIE_OPTIONS);
    await keepAccountsInCloud(req, res, jar);
    return res;
  }
  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
