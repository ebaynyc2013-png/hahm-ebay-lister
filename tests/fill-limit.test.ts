import { describe, expect, it, vi } from "vitest";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

const sent: any[] = [];
vi.mock("@/lib/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anthropic")>()),
  getClient: () => ({
    messages: {
      create: async (params: unknown) => {
        sent.push(params);
        return {
          model: "test",
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: "text", text: JSON.stringify({ facts: [] }) }],
        };
      },
    },
  }),
}));

const { fillRecommendedAspects, describeFill, MAX_ASPECTS_TO_FILL } = await import(
  "@/lib/ebay/aspectFill"
);

const aspect = (name: string, usage: AspectMeta["usage"]): AspectMeta => ({
  name,
  required: usage === "REQUIRED",
  usage,
  mode: "FREE_TEXT",
  cardinality: "SINGLE",
  values: ["Yes", "No"],
});

// Shaped like eBay's earrings category (261990): 53 fields, 5 required,
// 21 recommended, 27 optional — Theme, Vintage and Signed among the last.
const EARRINGS: AspectMeta[] = [
  ...Array.from({ length: 5 }, (_, i) => aspect(`Required ${i}`, "REQUIRED")),
  ...Array.from({ length: 21 }, (_, i) => aspect(`Recommended ${i}`, "RECOMMENDED")),
  ...Array.from({ length: 24 }, (_, i) => aspect(`Optional ${i}`, "OPTIONAL")),
  aspect("Theme", "OPTIONAL"),
  aspect("Vintage", "OPTIONAL"),
  aspect("Signed", "OPTIONAL"),
];
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

describe("every field eBay offers reaches the photo pass", () => {
  it("offers all 53 earring fields, the last ones included", async () => {
    sent.length = 0;
    const r = await fillRecommendedAspects(
      { title: "Gold hoop earrings", description: "" },
      {},
      EARRINGS,
      "SKU-1",
      [{ mediaType: "image/png", data: PNG }],
    );
    expect(MAX_ASPECTS_TO_FILL).toBeGreaterThanOrEqual(53);
    expect(r.offered).toBe(53);
    expect(r.skipped).toBe(0);
    const prompt: string = sent[0].messages[0].content.at(-1).text;
    for (const name of ["Theme", "Vintage", "Signed"])
      expect(prompt, name).toContain(`"${name}"`);
    expect(sent[0].max_tokens).toBeGreaterThanOrEqual(4000);
  });

  it("says so on screen if a category ever goes past the limit", () => {
    const line = describeFill({
      ran: true,
      photos: 3,
      offered: 80,
      skipped: 5,
      returned: 2,
      refused: 0,
      refusedWords: [],
      added: 1,
      changed: ["Theme"],
      note: "",
    });
    expect(line).toContain("5 fields were not offered to the AI");
  });
});
