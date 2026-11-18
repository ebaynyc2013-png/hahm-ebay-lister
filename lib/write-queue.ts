/**
 * "By morning · half price" (the seller, 18 Nov 2026): the main writing of a
 * listing goes into Anthropic's cheap queue (the Message Batches API) — every
 * token at 50 percent, usually back within an hour, at most 24 hours. The
 * online search and Prepare then run at once, as for a listing written now.
 */

/** How an item is written: at once, or in the cheap queue. */
export type WriteMode = "now" | "morning";

/** An item waiting in the cheap queue — everything needed to finish it. */
export interface QueuedWrite {
  batchId: string;
  /** The kind of item the first step found ("jewelry", "apparel"…). */
  profile: string;
  imageCount: number;
  /** Her Notes exactly as the AI got them. */
  sellerNotes: string;
  /** The ids of her phrases the AI was offered. */
  phraseIds: string[];
  /** When it went into the queue (ms). */
  submittedAt: number;
  /** Times it was put back after 24 hours unfinished (not charged). */
  retries: number;
}

/** What a check of the queue found. */
export type QueueCheck =
  | { state: "waiting" }
  | { state: "ready" }
  | { state: "expired" }
  | { state: "failed"; error: string };

/** Anthropic's batch ids. */
export function isBatchId(id: unknown): id is string {
  return typeof id === "string" && /^msgbatch_[A-Za-z0-9_-]{6,100}$/.test(id);
}

/** Every two minutes while the lister is open. */
export const QUEUE_CHECK_MS = 120_000;

/** Put back once after 24 hours unfinished — expired requests are not charged. */
export const QUEUE_MAX_RETRIES = 1;

/** What to do with an item after a check. */
export function afterCheck(
  check: QueueCheck,
  queue: Pick<QueuedWrite, "retries">,
): "wait" | "finish" | "requeue" | "fail" {
  if (check.state === "waiting") return "wait";
  if (check.state === "ready") return "finish";
  if (check.state === "expired") return queue.retries < QUEUE_MAX_RETRIES ? "requeue" : "fail";
  return "fail";
}

/** The error an item shows when the queue could not write it. */
export function queueFailure(check: QueueCheck): string {
  if (check.state === "expired")
    return "The cheap queue did not finish in 24 hours, twice (you were not charged). Press Try again to write it now.";
  if (check.state === "failed") return check.error || "The cheap queue could not write this listing.";
  return "";
}

/** "since 21:40", or "since Nov 17, 21:40" for an earlier day. */
export function queuedSince(submittedAt: number, now = Date.now()): string {
  const at = new Date(submittedAt);
  const time = at.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date(now).toDateString() === at.toDateString();
  if (today) return `since ${time}`;
  const day = at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `since ${day}, ${time}`;
}

/** Items to write at once and items for the queue, in their order on the screen. */
export function splitByMode<T extends { id: string; writeMode?: WriteMode }>(
  groups: readonly T[],
): { now: string[]; morning: string[] } {
  const now: string[] = [];
  const morning: string[] = [];
  for (const g of groups) (g.writeMode === "morning" ? morning : now).push(g.id);
  return { now, morning };
}
