// Learning from the seller's corrections (18 Nov 2026): what she changed on a
// card, made into short rules for similar items. Text only, a cent or two.
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, safeErrorResponse } from "@/lib/api-guard";
import { AnthropicAuthError, anthropicAuthError, getClient, parseModelJson } from "@/lib/anthropic";
import { collectUsage, currentUsage, measuredMessage } from "@/lib/ai-usage";
import { LEARN_RULES, LEARN_SCHEMA, cleanRules, learnMessage, learnRequestSchema } from "@/lib/learn";

export const maxDuration = 60;

// Text only: the mid model reads two versions of a listing well.
const LEARN_MODEL = "claude-sonnet-4-6";

async function handle(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;
  let body;
  try {
    body = learnRequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (!body.changes.title && !body.changes.description && !body.changes.specifics?.length)
    return NextResponse.json({ ok: true, rules: [], usage: [] });
  try {
    const resp = await measuredMessage(
      "learning",
      getClient(),
      {
        model: LEARN_MODEL,
        max_tokens: 1200,
        output_config: { format: { type: "json_schema", schema: LEARN_SCHEMA } },
        system: LEARN_RULES,
        messages: [{ role: "user", content: learnMessage(body) }],
      },
      { timeout: 45_000, maxRetries: 1 },
    );
    const block = resp.content.find((b) => b.type === "text");
    const rules = cleanRules(parseModelJson(block && block.type === "text" ? block.text : ""), body.kind);
    return NextResponse.json({ ok: true, rules, usage: currentUsage() });
  } catch (e) {
    const fatal = e instanceof AnthropicAuthError ? e : anthropicAuthError(e);
    if (fatal) return NextResponse.json({ ok: false, error: fatal.message }, { status: fatal.status });
    return safeErrorResponse("learn", e, "Could not learn from this card.");
  }
}

export async function POST(req: NextRequest) {
  return (await collectUsage(() => handle(req))).result;
}
