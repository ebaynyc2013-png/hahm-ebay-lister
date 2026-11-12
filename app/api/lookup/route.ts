// Finding the item online (the seller, 12 Nov 2026): web search, at most 3
// searches, for the item's own page on the brand's site or a big store.
import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { guardApiRequest, safeErrorResponse } from "@/lib/api-guard";
import { AnthropicAuthError, anthropicAuthError, getClient, parseModelJson } from "@/lib/anthropic";
import { collectUsage, currentUsage, measuredMessage } from "@/lib/ai-usage";
import { toImageBlock, type ImageBlock } from "@/lib/images";
import { LOOKUP_RULES, checkLookup, lookupMessage, type ProductLookup } from "@/lib/product-lookup";
import { parseListing, routerImagesSchema } from "@/lib/validation";

export const maxDuration = 120;

// Text and small photos: the mid model searches well for a fraction of the
// photo model's price.
const LOOKUP_MODEL = "claude-sonnet-4-6";
const MAX_SEARCHES = 3;
const MAX_PHOTOS = 4;

async function handle(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;
  let body: { listing?: unknown; images?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  let listing;
  try {
    listing = parseListing(body.listing);
  } catch {
    return NextResponse.json({ ok: false, error: "This draft could not be read." }, { status: 400 });
  }
  const small = routerImagesSchema.safeParse(body.images ?? []);
  const photos = (small.success ? small.data : [])
    .slice(0, MAX_PHOTOS)
    .map((img) => toImageBlock(img))
    .filter((b): b is ImageBlock => Boolean(b));
  try {
    const client: Anthropic = getClient();
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: [...photos, { type: "text", text: lookupMessage(listing) }] },
    ];
    let resp: Anthropic.Message | null = null;
    let searches = 0;
    // A long search may pause; let it finish once.
    for (let turn = 0; turn < 2; turn++) {
      resp = await measuredMessage(
        "lookup",
        client,
        {
          model: LOOKUP_MODEL,
          max_tokens: 2500,
          system: LOOKUP_RULES,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }],
          messages,
        },
        { timeout: 100_000, maxRetries: 0 },
      );
      searches +=
        (resp.usage as { server_tool_use?: { web_search_requests?: number } } | undefined)?.server_tool_use
          ?.web_search_requests ?? 0;
      if (resp.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: resp.content });
    }
    const text = (resp?.content ?? [])
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    let raw: Partial<ProductLookup> | null = null;
    try {
      raw = parseModelJson<Partial<ProductLookup>>(text);
    } catch {
      raw = null;
    }
    const lookup = checkLookup(raw, String(listing.brand ?? ""));
    const usd = currentUsage().reduce((n, u) => n + (u.estimatedUsd ?? 0), 0);
    // Each search is billed on top of the tokens: $10 per 1,000.
    lookup.usd = usd + searches * 0.01;
    return NextResponse.json({ ok: true, lookup, usage: currentUsage() });
  } catch (e) {
    const fatal = e instanceof AnthropicAuthError ? e : anthropicAuthError(e);
    if (fatal) return NextResponse.json({ ok: false, error: fatal.message }, { status: fatal.status });
    return safeErrorResponse("lookup", e, "Could not look the item up online — please try again.");
  }
}

export async function POST(req: NextRequest) {
  return (await collectUsage(() => handle(req))).result;
}
