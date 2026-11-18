import { describe, expect, it, vi } from "vitest";
import {
  afterCheck,
  isBatchId,
  queueFailure,
  queuedSince,
  splitByMode,
  QUEUE_MAX_RETRIES,
  type QueuedWrite,
} from "@/lib/write-queue";
import { restoredStatus } from "@/lib/draft-store";
import { estimateUsd, usageRow } from "@/lib/ai-usage";
import { buildAnalysisParams, finishListing, toImageBlocks } from "@/lib/analyze-core";
import { listingFromAnswer, readQueueItems } from "@/lib/queue-answer";
import type Anthropic from "@anthropic-ai/sdk";
import type { AnalyzeRequestBody } from "@/lib/types";

// "By morning · half price" (the seller, 18 Nov 2026).

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

const queue: QueuedWrite = {
  batchId: "msgbatch_01AbCdEf",
  profile: "jewelry",
  imageCount: 2,
  sellerNotes: "copper flower, bronze disc",
  phraseIds: ["rings-1"],
  submittedAt: Date.UTC(2026, 10, 18, 2, 40),
  retries: 0,
};

const RAW = {
  title: "Sterling Silver Leaf Pendant Necklace 18 in",
  description: "Sterling Silver Leaf Pendant Necklace 18 in\n\nA pretty leaf pendant.",
  brand: "Unbranded",
  condition: "EXCELLENT",
  condition_notes: "Excellent pre-owned condition: • Bright silver",
  hashtags: [],
  etsy_tags: [],
  specifics: [],
};

const body: AnalyzeRequestBody = {
  profile: "auto",
  images: [
    { mediaType: "image/png", data: PNG },
    { mediaType: "image/png", data: PNG },
  ],
  sellerNotes: "copper flower, bronze disc",
  phrases: [],
  references: [],
  lessons: [],
} as unknown as AnalyzeRequestBody;

const answer = (text: string, stop: Anthropic.Message["stop_reason"] = "end_turn") =>
  ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    stop_reason: stop,
    content: [{ type: "text", text }],
    usage: { input_tokens: 100_000, output_tokens: 4_000 },
  }) as unknown as Anthropic.Message;

describe("each item chooses now or by morning", () => {
  it("writes the 'now' items at once and queues the rest, in screen order", () => {
    const groups = [
      { id: "a" },
      { id: "b", writeMode: "morning" as const },
      { id: "c", writeMode: "now" as const },
      { id: "d", writeMode: "morning" as const },
    ];
    expect(splitByMode(groups)).toEqual({ now: ["a", "c"], morning: ["b", "d"] });
  });
});

describe("what a check of the queue leads to", () => {
  it("waits, finishes, puts back once, then gives up", () => {
    expect(afterCheck({ state: "waiting" }, queue)).toBe("wait");
    expect(afterCheck({ state: "ready" }, queue)).toBe("finish");
    expect(afterCheck({ state: "expired" }, { retries: 0 })).toBe("requeue");
    expect(afterCheck({ state: "expired" }, { retries: QUEUE_MAX_RETRIES })).toBe("fail");
    expect(afterCheck({ state: "failed", error: "x" }, queue)).toBe("fail");
  });

  it("says plainly that an expired item was not charged", () => {
    expect(queueFailure({ state: "expired" })).toContain("not charged");
    expect(queueFailure({ state: "failed", error: "Boom." })).toBe("Boom.");
  });

  it("shows when the item went into the queue", () => {
    const at = new Date(2026, 10, 18, 21, 40).getTime();
    expect(queuedSince(at, new Date(2026, 10, 18, 23, 0).getTime())).toBe("since 21:40");
    expect(queuedSince(at, new Date(2026, 10, 19, 7, 0).getTime())).toBe("since Nov 18, 21:40");
  });

  it("only accepts Anthropic's batch ids", () => {
    expect(isBatchId("msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d")).toBe(true);
    expect(isBatchId("../../secret")).toBe(false);
    expect(isBatchId(42)).toBe(false);
  });
});

describe("nothing is lost when the page is closed", () => {
  it("an item waiting in the queue keeps waiting after a reload", () => {
    expect(restoredStatus({ status: "queued", queue })).toBe("queued");
    // Its answer had come back and the online search was running.
    expect(restoredStatus({ status: "writing", queue })).toBe("queued");
    // Still being put into the queue: written again.
    expect(restoredStatus({ status: "queued" })).toBe("idle");
    expect(restoredStatus({ status: "writing" })).toBe("idle");
    expect(restoredStatus({ status: "done" })).toBe("done");
  });
});

describe("the cheap queue costs half", () => {
  it("halves every token, cache included", () => {
    const now = usageRow("analysis", "claude-opus-4-8", {
      input_tokens: 10_000,
      output_tokens: 4_000,
      cache_read_input_tokens: 50_000,
    } as Anthropic.Usage);
    const morning = usageRow(
      "analysis",
      "claude-opus-4-8",
      { input_tokens: 10_000, output_tokens: 4_000, cache_read_input_tokens: 50_000 } as Anthropic.Usage,
      { batch: true },
    );
    expect(now.estimatedUsd).toBeCloseTo(0.175, 6); // 10k×$5 + 4k×$25 + 50k×$0.5 per M
    expect(morning.estimatedUsd).toBeCloseTo(0.0875, 6);
    expect(morning.batch).toBe(true);
    expect(estimateUsd({ ...now, model: "unknown-model" })).toBeUndefined();
  });
});

describe("now and by morning write by the same rules", () => {

  it("sends the AI one and the same request", () => {
    const blocks = toImageBlocks(body.images);
    const p = buildAnalysisParams(body, "jewelry", "claude-opus-4-8", blocks);
    expect(p.model).toBe("claude-opus-4-8");
    expect(p.max_tokens).toBe(5000);
    const system = p.system as Anthropic.TextBlockParam[];
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    const content = p.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content.slice(0, 2).every((b) => b.type === "image")).toBe(true);
    expect(JSON.stringify(content)).toContain("copper flower, bronze disc");
    expect((content.at(-1) as Anthropic.TextBlockParam).text).toBe(
      "Analyze these photos and return the listing JSON now.",
    );
  });

  it("makes the queue's answer into the same listing as an answer now", () => {
    const direct = finishListing(JSON.stringify(RAW), {
      imageCount: 2,
      sellerNotes: queue.sellerNotes,
      phraseIds: queue.phraseIds,
      profile: "jewelry",
    });
    const fromQueue = listingFromAnswer(answer(JSON.stringify(RAW)), queue);
    expect(fromQueue.error).toBeUndefined();
    expect(fromQueue.listing).toEqual(direct);
    expect(fromQueue.listing?.seller_notes).toBe("copper flower, bronze disc");
    expect(fromQueue.listing?.item_profile).toBe("jewelry");
    // 100k × $5 + 4k × $25 per M, then half.
    expect(fromQueue.usage[0].estimatedUsd).toBeCloseTo(0.3, 6);
  });

  it("says so when the answer was cut off or cannot be read", () => {
    expect(listingFromAnswer(answer("{}", "max_tokens"), queue).error).toContain("truncated");
    expect(listingFromAnswer(answer("not json"), queue).error).toContain("could not be read");
  });
});

describe("a check request is read carefully", () => {
  it("keeps what it needs and refuses the rest", () => {
    const items = readQueueItems({ items: [{ groupId: "g1", queue: { ...queue, imageCount: 99 } }] });
    expect(items?.[0].queue.imageCount).toBe(24);
    expect(readQueueItems({ items: [] })).toBeNull();
    expect(readQueueItems({ items: [{ groupId: "g1", queue: { ...queue, batchId: "nope" } }] })).toBeNull();
    expect(readQueueItems({})).toBeNull();
  });
});

describe("the two server steps", () => {
  it("queues with exactly the request 'now' sends, and brings the listing back", async () => {
    const created: any[] = [];
    vi.resetModules();
    vi.doMock("@/lib/anthropic", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/anthropic")>()),
      getClient: () => ({
        messages: {
          // The first step: what kind of item it is.
          create: async () => ({
            model: "claude-sonnet-4-6",
            stop_reason: "end_turn",
            usage: { input_tokens: 1_000, output_tokens: 10 },
            content: [{ type: "text", text: JSON.stringify({ profile: "clothing" }) }],
          }),
          batches: {
            create: async (params: unknown) => {
              created.push(params);
              return { id: "msgbatch_01TestTest" };
            },
            retrieve: async () => ({ processing_status: "ended" }),
            results: async () =>
              (async function* () {
                yield { custom_id: "listing", result: { type: "succeeded", message: answer(JSON.stringify(RAW)) } };
              })(),
          },
        },
      }),
    }));
    const { NextRequest } = await import("next/server");
    const queueRoute = await import("@/app/api/analyze/queue/route");
    const checkRoute = await import("@/app/api/analyze/queue-check/route");
    const req = (url: string, b: unknown) =>
      new NextRequest(url, { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } });

    const q = await (await queueRoute.POST(req("http://localhost/api/analyze/queue", body))).json();
    expect(q.ok).toBe(true);
    expect(q.queued.batchId).toBe("msgbatch_01TestTest");
    expect(q.queued.profile).toBe("clothing");
    expect(created[0].requests[0].custom_id).toBe("listing");
    expect(created[0].requests[0].params).toEqual(
      buildAnalysisParams(body, "clothing", "claude-opus-4-8", toImageBlocks(body.images)),
    );
    // The first step's cost is counted at the normal price.
    expect(q.usage[0].stage).toBe("routing");
    expect(q.usage[0].batch).toBeUndefined();

    const c = await (
      await checkRoute.POST(req("http://localhost/api/analyze/queue-check", { items: [{ groupId: "g1", queue: q.queued }] }))
    ).json();
    expect(c.ok).toBe(true);
    expect(c.results[0].state).toBe("ready");
    expect(c.results[0].listing.title).toBeTruthy();
    expect(c.results[0].usage[0].batch).toBe(true);
    vi.doUnmock("@/lib/anthropic");
  });
});
