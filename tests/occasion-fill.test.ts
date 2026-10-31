import { describe, expect, it, vi } from "vitest";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

let reply: unknown = {};
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
          content: [{ type: "text", text: JSON.stringify(reply) }],
        };
      },
    },
  }),
}));

const { fillRecommendedAspects } = await import("@/lib/ebay/aspectFill");

// Women's tops (53159), Occasion as eBay lists it, 31 Oct 2026.
const OCCASION: AspectMeta = {
  name: "Occasion",
  required: false,
  usage: "OPTIONAL",
  mode: "FREE_TEXT",
  cardinality: "MULTI",
  values: ["Business", "Casual", "Formal", "Party/Cocktail", "Travel", "Wedding", "Workwear"],
} as AspectMeta;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

describe("Occasion gets several honest values, like Season (the seller, 31 Oct 2026)", () => {
  it("keeps every occasion the AI names from eBay's list", async () => {
    reply = {
      facts: [{ name: "Occasion", value: "Casual | Travel", photoIndices: [1], basis: "visible_feature", quote: "" }],
    };
    const aspects: Record<string, string[]> = {};
    await fillRecommendedAspects(
      { title: "GreenHouse Floral Top T-Shirt Tee", description: "" },
      aspects,
      [OCCASION],
      "SKU-1",
      [{ mediaType: "image/png", data: PNG }],
    );
    expect(aspects.Occasion).toEqual(["Casual", "Travel"]);
  });

  it("tells the AI to give several, and never to pad", () => {
    const prompt: string = sent[0].messages[0].content.at(-1).text;
    expect(prompt).toContain("give SEVERAL, the way Season gets every season");
    expect(prompt).toContain("is Casual and also Travel");
    expect(prompt).toContain("never add one to reach a number");
  });
});
