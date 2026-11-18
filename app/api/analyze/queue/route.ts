import { collectUsage, currentUsage } from "@/lib/ai-usage";
import { NextRequest, NextResponse } from "next/server";
import { AnthropicAuthError } from "@/lib/anthropic";
import { guardApiRequest, safeErrorResponse } from "@/lib/api-guard";
import { buildAnalysisParams, startAnalysis } from "@/lib/analyze-core";
import type { QueuedWrite } from "@/lib/write-queue";

/**
 * "By morning · half price" (the seller, 18 Nov 2026): the first step (what
 * kind of item it is) runs now; the main writing goes into Anthropic's cheap
 * queue with exactly the request "now" would send. Nothing is written yet —
 * /api/analyze/queue-check brings the listing back when it is done.
 */
export const maxDuration = 60;

const QUEUE_TIME_BUDGET_MS = 40_000;
const BATCH_CREATE_TIMEOUT_MS = 30_000;

async function handle(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const started = await startAnalysis(raw, Date.now() + QUEUE_TIME_BUDGET_MS);
    if ("error" in started)
      return NextResponse.json({ ok: false, error: started.error }, { status: started.status });
    const { body, client, imageBlocks, analysisModel, profile } = started;
    const params = buildAnalysisParams(body, profile, analysisModel, imageBlocks);
    const batch = await client.messages.batches.create(
      { requests: [{ custom_id: "listing", params }] },
      { timeout: BATCH_CREATE_TIMEOUT_MS, maxRetries: 1 },
    );
    const queued: QueuedWrite = {
      batchId: batch.id,
      profile,
      imageCount: imageBlocks.length,
      sellerNotes: body.sellerNotes ?? "",
      phraseIds: (body.phrases ?? []).map((p) => p.id),
      submittedAt: Date.now(),
      retries: 0,
    };
    console.info(JSON.stringify({ event: "queued", batchId: batch.id, profile }));
    return NextResponse.json({ ok: true, queued, usage: currentUsage() });
  } catch (e) {
    if (e instanceof AnthropicAuthError) {
      console.error("[analyze/queue] auth/billing failure:", e.message);
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return safeErrorResponse(
      "analyze/queue",
      e,
      "Could not put this listing in the cheap queue — please try again.",
    );
  }
}

export async function POST(req: NextRequest) {
  return (await collectUsage(() => handle(req))).result;
}
