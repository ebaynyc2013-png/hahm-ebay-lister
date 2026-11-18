import { AsyncLocalStorage } from "node:async_hooks";
import type Anthropic from "@anthropic-ai/sdk";
export interface AiUsage {
  stage: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Of cacheWrite, the tokens written to the 1-hour cache (priced at 2×). */
  cacheWrite1h?: number;
  ms: number;
  ok: boolean;
  estimatedUsd?: number;
  /** Written in the cheap queue ("by morning"): every token at half price. */
  batch?: boolean;
}

// Estimates use standard global list rates; raw counts are authoritative.
const RATES: Record<string, [number, number]> = {
  "claude-sonnet-4-6": [3, 15],
  "claude-opus-4-8": [5, 25],
  "claude-opus-4-7": [5, 25],
  "claude-opus-4-6": [5, 25],
  "claude-haiku-4-5": [1, 5],
};

/**
 * The dollars a row cost. The cheap queue charges 50 percent of every token,
 * cache reads and writes included — the discounts stack (Anthropic's batch
 * pricing, 18 Nov 2026).
 */
export function estimateUsd(row: AiUsage): number | undefined {
  const rate = RATES[row.model] ?? RATES[row.model.replace(/-\d{8}$/, "")];
  if (!rate) return undefined;
  const usd =
    (row.input * rate[0] +
      row.output * rate[1] +
      row.cacheRead * rate[0] * 0.1 +
      // 5-minute writes cost 1.25× input, 1-hour writes 2× (Anthropic's
      // prompt-caching prices).
      (row.cacheWrite - (row.cacheWrite1h ?? 0)) * rate[0] * 1.25 +
      (row.cacheWrite1h ?? 0) * rate[0] * 2) /
    1e6;
  return row.batch ? usd / 2 : usd;
}

/** The usage row of one answer, from its own token counts. */
export function usageRow(
  stage: string,
  model: string,
  u: Partial<Anthropic.Usage> | undefined,
  extra: { ms?: number; batch?: boolean } = {},
): AiUsage {
  const row: AiUsage = {
    stage,
    model,
    input: u?.input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
    cacheWrite: u?.cache_creation_input_tokens ?? 0,
    cacheWrite1h: u?.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    ms: extra.ms ?? 0,
    ok: true,
    ...(extra.batch ? { batch: true } : {}),
  };
  const usd = estimateUsd(row);
  if (usd !== undefined) row.estimatedUsd = usd;
  return row;
}
const scope = new AsyncLocalStorage<AiUsage[]>();
export async function collectUsage<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; usage: AiUsage[] }> {
  const usage: AiUsage[] = [];
  return scope.run(usage, async () => ({ result: await fn(), usage }));
}
export function currentUsage(): AiUsage[] {
  return scope.getStore() ?? [];
}
export async function measuredMessage(
  stage: string,
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: Parameters<Anthropic["messages"]["create"]>[1],
): Promise<Anthropic.Message> {
  const start = Date.now();
  let row: AiUsage = {
    stage,
    model: params.model,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    ms: 0,
    ok: false,
  };
  try {
    const r = await client.messages.create(params, options);
    row = usageRow(stage, r.model || params.model, r.usage);
    // Priced by the model asked for, as before.
    const usd = estimateUsd({ ...row, model: params.model });
    if (usd === undefined) delete row.estimatedUsd;
    else row.estimatedUsd = usd;
    if (r.stop_reason === "max_tokens")
      throw new Error(
        "AI output was truncated. Retry with fewer requested fields.",
      );
    return r;
  } finally {
    row.ms = Date.now() - start;
    scope.getStore()?.push(row);
    console.info(JSON.stringify({ event: "ai_usage", ...row }));
  }
}
