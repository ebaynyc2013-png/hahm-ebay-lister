import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/ebay/oauth";
import { guardApiRequest } from "@/lib/api-guard";
import { connectionFromToken } from "@/lib/ebay/session";
import { LABEL_COOKIE, saveAccount } from "@/lib/ebay/accounts";

export const dynamic = "force-dynamic";

// Manual connect: the user pastes the URL (or code) from eBay's success page.
// Mirrors the Python script's copy-the-redirect-URL flow, which is immune to
// eBay's redirect-URL configuration quirks.
function extractCode(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  // Full URL → read ?code=
  try {
    const u = new URL(raw);
    const c = u.searchParams.get("code");
    if (c) return c;
  } catch {
    /* not a full URL */
  }
  // A bare query string or "...&code=..." fragment.
  const m = raw.match(/[?&]code=([^&\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  // Looks like just the code itself (eBay codes start with "v^1").
  if (raw.startsWith("v^")) return raw;
  return null;
}

export async function POST(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;

  let body: { url?: string; code?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const code = body.code?.trim() || extractCode(body.url || "");
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "Couldn't find an authorization code in what you pasted." },
      { status: 400 }
    );
  }

  try {
    const token = await exchangeCode(code);
    if (!token.refresh_token) {
      throw new Error("eBay didn't return a refresh token (the code may have expired — try again).");
    }
    const res = NextResponse.json({ ok: true });
    // Kept beside any other connected account and made the active one.
    const saved = await saveAccount(
      req.cookies,
      res,
      connectionFromToken(token.refresh_token, token.refresh_token_expires_in),
      body.label ?? req.cookies.get(LABEL_COOKIE)?.value,
    );
    res.cookies.delete(LABEL_COOKIE);
    const out = NextResponse.json({ ok: true, label: saved.label });
    for (const c of res.cookies.getAll()) out.cookies.set(c);
    return out;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 502 }
    );
  }
}
