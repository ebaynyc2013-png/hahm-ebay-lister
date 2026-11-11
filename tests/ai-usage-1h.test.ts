import { describe, expect, it } from "vitest";
import { collectUsage, measuredMessage } from "@/lib/ai-usage";
import type Anthropic from "@anthropic-ai/sdk";

const fakeClient = (usage: Record<string, unknown>) =>
  ({
    messages: {
      create: async () => ({ model: "claude-opus-4-8", stop_reason: "end_turn", content: [], usage }),
    },
  }) as unknown as Anthropic;

describe("cost of the 1-hour rules memory (10 Nov 2026)", () => {
  it("prices a 1-hour cache write at 2× input", async () => {
    const { usage } = await collectUsage(() =>
      measuredMessage("analysis", fakeClient({
        input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0,
        cache_creation_input_tokens: 20_000,
        cache_creation: { ephemeral_1h_input_tokens: 20_000, ephemeral_5m_input_tokens: 0 },
      }), { model: "claude-opus-4-8", max_tokens: 10, messages: [] }),
    );
    expect(usage[0].cacheWrite1h).toBe(20_000);
    expect(usage[0].estimatedUsd).toBeCloseTo(0.2, 6); // 20k × $5/M × 2
  });

  it("keeps 1.25× for a 5-minute write", async () => {
    const { usage } = await collectUsage(() =>
      measuredMessage("analysis", fakeClient({
        input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0,
        cache_creation_input_tokens: 20_000,
      }), { model: "claude-opus-4-8", max_tokens: 10, messages: [] }),
    );
    expect(usage[0].estimatedUsd).toBeCloseTo(0.125, 6);
  });

  it("the listing rules use the 5-minute memory (the seller's choice, 11 Nov 2026)", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("app/api/analyze/route.ts", "utf8");
    expect(src).toContain('cache_control: { type: "ephemeral" }');
    expect(src).not.toContain('ttl: "1h"');
  });
});
