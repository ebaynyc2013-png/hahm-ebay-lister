import { NextRequest, NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/api-guard";
import { isEbayConfigured } from "@/lib/ebay/config";
import { activeSlotOf, migrateLegacy, publicAccounts } from "@/lib/ebay/accounts";

export const dynamic = "force-dynamic";

// Lightweight check the UI calls on load: is eBay set up, which accounts are
// connected and which one is active? Names only — never a token — so it stays
// outside the access code, but not outside the rate limiter.
export async function GET(req: NextRequest) {
  const limited = rateLimitRequest(req);
  if (limited) return limited;

  const configured = isEbayConfigured();
  const res = NextResponse.json({});
  // The one account connected before accounts had names becomes "Account 1".
  const accounts = await migrateLegacy(req.cookies, res);
  const active = activeSlotOf(req.cookies, accounts);
  const body = {
    configured,
    connected: active !== null,
    accounts: publicAccounts(accounts, active),
    activeLabel: accounts.find((a) => a.slot === active)?.label ?? "",
  };
  const out = NextResponse.json(body);
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
