import { collectUsage, currentUsage, measuredMessage } from "@/lib/ai-usage";
import { NextRequest, NextResponse } from "next/server";
import { AnthropicAuthError, anthropicAuthError } from "@/lib/anthropic";
import { guardApiRequest, safeErrorResponse } from "@/lib/api-guard";
import {
  MIN_CALL_MS,
  buildAnalysisParams,
  finishListing,
  firstText,
  startAnalysis,
} from "@/lib/analyze-core";

// Analysis takes 20-40s for a multi-photo item on a good day — and far longer
// when the API is slow. Run under the platform's 300s cap with our own budget
// (below) so a slow run fails with an error we control and a working Retry,
// not a platform kill (FUNCTION_INVOCATION_TIMEOUT).
export const maxDuration = 300;

// Stop starting work once the budget is spent — headroom under maxDuration.
const ANALYZE_TIME_BUDGET_MS = 250_000;
// Per-call cap: the SDK's default timeout is 10 MINUTES, so without it one
// stalled call would eat the whole function budget. SDK-internal retries stay
// off — the loop below is the single retry layer.
const ANALYSIS_CALL_TIMEOUT_MS = 120_000;

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
    const deadline = Date.now() + ANALYZE_TIME_BUDGET_MS;
    const started = await startAnalysis(raw, deadline);
    if ("error" in started)
      return NextResponse.json({ ok: false, error: started.error }, { status: started.status });
    const { body, client, imageBlocks, analysisModel, profile } = started;
    const params = buildAnalysisParams(body, profile, analysisModel, imageBlocks);

    // Retry up to 3 times, mirroring the Python analyze_photos() loop — but
    // never start an attempt the time budget can't cover.
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_CALL_MS) {
        lastErr =
          lastErr ??
          new Error("Analysis ran out of time — the API is slow right now.");
        break;
      }
      try {
        const resp = await measuredMessage("analysis", client, params, {
          timeout: Math.min(ANALYSIS_CALL_TIMEOUT_MS, remaining),
          maxRetries: 0,
        });
        const listing = finishListing(firstText(resp), {
          imageCount: imageBlocks.length,
          sellerNotes: body.sellerNotes,
          phraseIds: (body.phrases ?? []).map((p) => p.id),
          profile,
        });
        return NextResponse.json({ ok: true, listing, usage: currentUsage() });
      } catch (err) {
        const fatal = anthropicAuthError(err);
        if (fatal) throw fatal; // auth/billing won't fix itself on retry
        lastErr = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  } catch (e) {
    if (e instanceof AnthropicAuthError) {
      console.error("[analyze] auth/billing failure:", e.message);
      return NextResponse.json(
        { ok: false, error: e.message },
        { status: e.status },
      );
    }
    return safeErrorResponse(
      "analyze",
      e,
      "Something went wrong analyzing photos — please try again.",
    );
  }
}

export async function POST(req: NextRequest) {
  return (await collectUsage(() => handle(req))).result;
}
