import type { AiUsage } from "@/lib/ai-usage";
import { NextRequest, NextResponse } from "next/server";
import { anthropicAuthError, getClient } from "@/lib/anthropic";
import { guardApiRequest, safeErrorResponse } from "@/lib/api-guard";
import { listingFromAnswer, readQueueItems, type QueueItem } from "@/lib/queue-answer";
import type { QueueCheck } from "@/lib/write-queue";
import type Anthropic from "@anthropic-ai/sdk";
import type { ListingResult } from "@/lib/types";

/**
 * Checks the cheap queue for the items waiting in it (the seller, 18 Nov
 * 2026). A finished one comes back as its listing; the rest keep waiting.
 */
export const maxDuration = 60;

type Result = QueueCheck & { groupId: string; listing?: ListingResult; usage?: AiUsage[] };

async function checkOne(client: Anthropic, item: QueueItem): Promise<Result> {
  const { groupId, queue } = item;
  const batch = await client.messages.batches.retrieve(queue.batchId, undefined, {
    timeout: 15_000,
    maxRetries: 1,
  });
  if (batch.processing_status !== "ended") return { groupId, state: "waiting" };
  const results = await client.messages.batches.results(queue.batchId, undefined, {
    timeout: 30_000,
    maxRetries: 1,
  });
  for await (const r of results) {
    if (r.custom_id !== "listing") continue;
    if (r.result.type === "succeeded") {
      const done = listingFromAnswer(r.result.message, queue);
      if (done.error) return { groupId, state: "failed", error: done.error, usage: done.usage };
      return { groupId, state: "ready", listing: done.listing, usage: done.usage };
    }
    if (r.result.type === "expired") return { groupId, state: "expired" };
    if (r.result.type === "canceled")
      return {
        groupId,
        state: "failed",
        error: "The cheap queue canceled this listing (you were not charged). Press Try again.",
      };
    const msg = r.result.error?.error?.message;
    return {
      groupId,
      state: "failed",
      error: `The cheap queue could not write this listing${msg ? `: ${msg}` : ""} (you were not charged). Press Try again.`,
    };
  }
  return {
    groupId,
    state: "failed",
    error: "The cheap queue returned nothing for this listing. Press Try again.",
  };
}

export async function POST(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;
  let items: QueueItem[] | null = null;
  try {
    items = readQueueItems(await req.json());
  } catch {
    items = null;
  }
  if (!items)
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  let client: Anthropic;
  try {
    client = getClient();
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
  try {
    const results: Result[] = [];
    for (const item of items) {
      try {
        results.push(await checkOne(client, item));
      } catch (e) {
        const fatal = anthropicAuthError(e);
        if (fatal) throw fatal;
        // A check that did not get through is simply tried again later.
        console.warn("[analyze/queue-check]", item.queue.batchId, (e as Error).message);
        results.push({ groupId: item.groupId, state: "waiting" });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const fatal = anthropicAuthError(e);
    if (fatal)
      return NextResponse.json({ ok: false, error: fatal.message }, { status: fatal.status });
    return safeErrorResponse("analyze/queue-check", e, "Could not check the cheap queue.");
  }
}
