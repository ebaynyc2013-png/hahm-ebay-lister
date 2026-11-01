import { NextRequest, NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/api-guard";
import { exchangeCode } from "@/lib/ebay/oauth";
import { EBAY_STATE_COOKIE, connectionFromToken } from "@/lib/ebay/session";
import { LABEL_COOKIE, saveAccount } from "@/lib/ebay/accounts";

export const dynamic = "force-dynamic";

function appUrl(req: NextRequest, path: string): URL {
  // Prefer an explicit APP_URL; otherwise derive from the request.
  const base = process.env.APP_URL || req.nextUrl.origin;
  return new URL(path, base);
}

// eBay redirects the user back here with ?code=... after they consent.
// Must stay reachable without the access code (it's a browser redirect from
// eBay), so it is protected by the state cookie below plus the rate limiter.
export async function GET(req: NextRequest) {
  const limited = rateLimitRequest(req);
  if (limited) return limited;

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(EBAY_STATE_COOKIE)?.value;

  if (!code) {
    return NextResponse.redirect(appUrl(req, "/?ebay=error&msg=No+authorization+code"));
  }
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(appUrl(req, "/?ebay=error&msg=State+mismatch"));
  }

  try {
    const token = await exchangeCode(code);
    if (!token.refresh_token) {
      throw new Error("eBay did not return a refresh token.");
    }
    const res = NextResponse.redirect(appUrl(req, "/?ebay=connected"));
    // Kept beside any other connected account, under the name she gave it,
    // and made the active one.
    await saveAccount(
      req.cookies,
      res,
      connectionFromToken(token.refresh_token, token.refresh_token_expires_in),
      req.cookies.get(LABEL_COOKIE)?.value,
    );
    res.cookies.delete(EBAY_STATE_COOKIE);
    res.cookies.delete(LABEL_COOKIE);
    return res;
  } catch (e) {
    const msg = encodeURIComponent((e as Error).message);
    return NextResponse.redirect(appUrl(req, `/?ebay=error&msg=${msg}`));
  }
}
