"use client";
// Calls "Update with notes" (/api/revise): text only, a few cents (12 Nov 2026).
import { apiPost } from "@/lib/api-client";
import type { ListingResult } from "@/lib/types";

export interface ReviseResult {
  patch: Partial<ListingResult>;
  changed: string[];
  /** What the call cost, in US dollars, when known. */
  usd?: number;
}

export async function reviseListing(listing: ListingResult, facts: string): Promise<ReviseResult> {
  const res = await apiPost("/api/revise", { listing, facts });
  let data: { ok?: boolean; error?: string; patch?: Partial<ListingResult>; changed?: string[]; usage?: { estimatedUsd?: number }[] };
  try {
    data = await res.json();
  } catch {
    throw new Error("The update did not answer — please try again.");
  }
  if (!res.ok || !data.ok || !data.patch) throw new Error(data.error || "Could not update the listing — please try again.");
  const usd = (data.usage ?? []).reduce((n, u) => n + (u.estimatedUsd ?? 0), 0);
  return { patch: data.patch, changed: data.changed ?? [], usd: usd || undefined };
}

/** "2¢" / "$0.12" — what an update cost, for the line under it. */
export const showCost = (usd?: number) =>
  usd === undefined ? "" : usd < 0.1 ? `${Math.max(1, Math.round(usd * 100))}¢` : `$${usd.toFixed(2)}`;
