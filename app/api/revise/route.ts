// "Update with notes" and the doubt buttons (12 Nov 2026): the listing is
// corrected from the seller's new facts, text only — no photos, a few cents.
import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { guardApiRequest, safeErrorResponse } from "@/lib/api-guard";
import { AnthropicAuthError, anthropicAuthError, getClient, parseModelJson } from "@/lib/anthropic";
import { collectUsage, currentUsage, measuredMessage } from "@/lib/ai-usage";
import { REVISE_RULES, REVISE_SCHEMA, applyRevision, reviseMessage, type Revision } from "@/lib/revise";
import { parseListing } from "@/lib/validation";

export const maxDuration = 120;

// Text only, no photos: the mid model writes this well for a fraction of the
// cost of the photo model.
const REVISE_MODEL = "claude-sonnet-4-6";

async function handle(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;
  let body: { listing?: unknown; facts?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const facts = typeof body.facts === "string" ? body.facts.trim().slice(0, 2000) : "";
  if (!facts) return NextResponse.json({ ok: false, error: "Write what to change first." }, { status: 400 });
  let listing;
  try {
    listing = parseListing(body.listing);
  } catch {
    return NextResponse.json({ ok: false, error: "This draft could not be read." }, { status: 400 });
  }
  try {
    const client: Anthropic = getClient();
    const resp = await measuredMessage(
      "revise",
      client,
      {
        model: REVISE_MODEL,
        max_tokens: 3000,
        output_config: { format: { type: "json_schema", schema: REVISE_SCHEMA } },
        system: REVISE_RULES,
        messages: [{ role: "user", content: reviseMessage(listing, facts) }],
      },
      { timeout: 90_000, maxRetries: 1 },
    );
    const block = resp.content.find((b) => b.type === "text");
    const revision = parseModelJson<Revision>(block && block.type === "text" ? block.text : "");
    const { patch, changed } = applyRevision(listing, revision);
    return NextResponse.json({ ok: true, patch, changed, usage: currentUsage() });
  } catch (e) {
    const fatal = e instanceof AnthropicAuthError ? e : anthropicAuthError(e);
    if (fatal) return NextResponse.json({ ok: false, error: fatal.message }, { status: fatal.status });
    return safeErrorResponse("revise", e, "Could not update the listing — please try again.");
  }
}

export async function POST(req: NextRequest) {
  return (await collectUsage(() => handle(req))).result;
}
