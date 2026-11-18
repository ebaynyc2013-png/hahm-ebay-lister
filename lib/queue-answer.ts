import { usageRow, type AiUsage } from "@/lib/ai-usage";
import { finishListing, firstText } from "@/lib/analyze-core";
import { isBatchId, type QueuedWrite } from "@/lib/write-queue";
import type Anthropic from "@anthropic-ai/sdk";
import type { ListingResult } from "@/lib/types";

/** The most items one check of the cheap queue looks at. */
export const MAX_QUEUE_ITEMS = 25;

export type QueueItem = { groupId: string; queue: QueuedWrite };

/** The items of a check request, checked; null for a request that cannot be used. */
export function readQueueItems(raw: unknown): QueueItem[] | null {
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_QUEUE_ITEMS) return null;
  const out: QueueItem[] = [];
  for (const it of items) {
    const groupId = (it as QueueItem)?.groupId;
    const q = (it as QueueItem)?.queue;
    if (typeof groupId !== "string" || !groupId || groupId.length > 200) return null;
    if (!q || !isBatchId(q.batchId)) return null;
    out.push({
      groupId,
      queue: {
        batchId: q.batchId,
        profile: typeof q.profile === "string" ? q.profile.slice(0, 60) : "hard_goods",
        imageCount: Number.isFinite(q.imageCount)
          ? Math.max(0, Math.min(24, Math.floor(q.imageCount)))
          : 0,
        sellerNotes: typeof q.sellerNotes === "string" ? q.sellerNotes.slice(0, 2000) : "",
        phraseIds: Array.isArray(q.phraseIds)
          ? q.phraseIds.filter((x): x is string => typeof x === "string").slice(0, 100)
          : [],
        submittedAt: Number(q.submittedAt) || 0,
        retries: Number(q.retries) || 0,
      },
    });
  }
  return out;
}

/**
 * One finished answer from the cheap queue made into the card's listing — by
 * exactly the rules a listing written now goes through — and its cost, at
 * half price.
 */
export function listingFromAnswer(
  message: Anthropic.Message,
  queue: QueuedWrite,
): { listing?: ListingResult; usage: AiUsage[]; error?: string } {
  const usage = [usageRow("analysis", message.model, message.usage, { batch: true })];
  if (message.stop_reason === "max_tokens")
    return { usage, error: "AI output was truncated. Press Try again to write it now." };
  try {
    const listing = finishListing(firstText(message), {
      imageCount: queue.imageCount,
      sellerNotes: queue.sellerNotes,
      phraseIds: queue.phraseIds,
      profile: queue.profile,
    });
    return { listing, usage };
  } catch {
    return {
      usage,
      error: "The AI's answer could not be read. Press Try again to write it now.",
    };
  }
}
