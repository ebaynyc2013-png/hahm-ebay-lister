import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables (or in .env.local for local dev)."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Mirrors _load_model_json() in the Python script: strip code fences, then fall
// back to grabbing the outermost {...} block.
export function parseModelJson<T = unknown>(raw: string): T {
  let text = (raw || "").trim();
  text = text.replace(/^```(?:json)?\s*/gm, "").replace(/\s*```$/gm, "");
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new Error("Model did not return valid JSON.");
  }
}

// ── Account-level Anthropic failures ─────────────────────────────────────────
// A bad/missing key, missing model access, or exhausted credits makes EVERY
// call fail, so retrying or degrading is pointless — it just surfaces a vague
// error. Detect these and throw a typed error so routes can show the real cause.
export class AnthropicAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AnthropicAuthError";
    this.status = status;
  }
}

/**
 * Anthropic's own words for a failure ("Your organization does not have
 * access to …"), so the seller sees the real cause instead of a guess (30 Oct
 * 2026: a 403 with no reason left us guessing). Never carries the key.
 */
export function anthropicReason(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  const body = (e as { error?: unknown }).error as
    | { message?: unknown; error?: { message?: unknown } }
    | undefined;
  let text = "";
  if (typeof body?.error?.message === "string") text = body.error.message;
  else if (typeof body?.message === "string") text = body.message;
  if (!text) {
    const raw = String((e as { message?: unknown }).message ?? "");
    const quoted = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    try {
      text = quoted ? JSON.parse(`"${quoted[1]}"`) : raw.replace(/^\d{3}\s*/, "");
    } catch {
      text = raw.replace(/^\d{3}\s*/, "");
    }
  }
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function withReason(message: string, e: unknown): string {
  const reason = anthropicReason(e);
  return reason ? `${message} Anthropic says: "${reason}"` : message;
}

export function anthropicAuthError(e: unknown): AnthropicAuthError | null {
  const status =
    e && typeof e === "object" && "status" in e
      ? Number((e as { status?: number }).status)
      : undefined;
  const message =
    e && typeof e === "object" && "message" in e
      ? String((e as { message?: unknown }).message ?? "")
      : "";
  if (status === 401)
    return new AnthropicAuthError(
      withReason(
        "Anthropic rejected your API key (401). Check that ANTHROPIC_API_KEY is set correctly in your environment variables.",
        e,
      ),
      401
    );
  if (status === 403)
    return new AnthropicAuthError(
      withReason(
        "Anthropic refused this request (403) — something about your API key or account; the reason is below. Check it in the Anthropic Console.",
        e,
      ),
      403
    );
  if (status === 402 || /credit balance|too low|billing|payment|insufficient|quota/i.test(message))
    return new AnthropicAuthError(
      withReason(
        "Your Anthropic account can't cover this request — add credits/billing in the Anthropic Console, then try again.",
        e,
      ),
      402
    );
  return null;
}
