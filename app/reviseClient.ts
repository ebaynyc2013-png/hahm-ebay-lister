"use client";
// Calls "Update with notes" (/api/revise): text only, a few cents (12 Nov 2026).
import { apiPost } from "@/lib/api-client";
import type { ListingResult } from "@/lib/types";
import type { AiUsage } from "@/lib/ai-usage";
import type { AspectMeta } from "@/lib/ebay/taxonomy";
import { snapRevisionToLists } from "@/lib/revise";

export interface ReviseResult {
  patch: Partial<ListingResult>;
  changed: string[];
  /** What the call cost, in US dollars, when known. */
  usd?: number;
  /** The call's own cost lines, for the card's total. */
  usage: AiUsage[];
}

/**
 * `aspects`: the category's eBay fields, when the draft is prepared — a field
 * with eBay's list then takes a word from it (13 Nov 2026).
 */
export async function reviseListing(
  listing: ListingResult,
  facts: string,
  aspects?: AspectMeta[],
): Promise<ReviseResult> {
  const res = await apiPost("/api/revise", { listing, facts });
  let data: { ok?: boolean; error?: string; patch?: Partial<ListingResult>; changed?: string[]; usage?: AiUsage[] };
  try {
    data = await res.json();
  } catch {
    throw new Error("The update did not answer — please try again.");
  }
  if (!res.ok || !data.ok || !data.patch) throw new Error(data.error || "Could not update the listing — please try again.");
  const usd = (data.usage ?? []).reduce((n, u) => n + (u.estimatedUsd ?? 0), 0);
  const { patch, changed } = snapRevisionToLists(listing, { patch: data.patch, changed: data.changed ?? [] }, aspects);
  return { patch, changed, usd: usd || undefined, usage: data.usage ?? [] };
}

/** "2¢" / "$0.12" — what an update cost, for the line under it. */
export const showCost = (usd?: number) =>
  usd === undefined ? "" : usd < 0.1 ? `${Math.max(1, Math.round(usd * 100))}¢` : `$${usd.toFixed(2)}`;
