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

const STONES = ["Agate", "Crystal", "No Stone", "Pearl", "Topaz"];
const aspect = (name: string, values: string[], required = false): AspectMeta => ({
  name,
  required,
  usage: required ? "REQUIRED" : "RECOMMENDED",
  mode: "FREE_TEXT",
  cardinality: "SINGLE",
  values,
});
// Fine earrings (261990): Main Stone is required there.
const META = [aspect("Main Stone", STONES, true), aspect("Secondary Stone", STONES)];
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const fact = (name: string, value: string) => ({
  name,
  value,
  photoIndices: [1],
  basis: "visible_feature",
  quote: "",
});

describe("a plain metal piece gets eBay's 'No Stone'", () => {
  it("fills Main Stone and Secondary Stone from the photo", async () => {
    reply = { facts: [fact("Main Stone", "No Stone"), fact("Secondary Stone", "No Stone")] };
    const aspects: Record<string, string[]> = {};
    const r = await fillRecommendedAspects(
      { title: "14K Gold Hoop Earrings", description: "" },
      aspects,
      META,
      "SKU-1",
      [{ mediaType: "image/png", data: PNG }],
    );
    expect(aspects["Main Stone"]).toEqual(["No Stone"]);
    expect(aspects["Secondary Stone"]).toEqual(["No Stone"]);
    expect(r.refusedWords).toEqual([]);
  });

  it("still refuses a stone named by its look", async () => {
    reply = { facts: [fact("Main Stone", "Topaz")] };
    const aspects: Record<string, string[]> = {};
    const r = await fillRecommendedAspects(
      { title: "Gold ring", description: "" },
      aspects,
      META,
      "SKU-2",
      [{ mediaType: "image/png", data: PNG }],
    );
    expect(aspects["Main Stone"]).toBeUndefined();
    expect(r.refusedWords[0]).toMatchObject({ aspect: "Main Stone", value: "Topaz" });
  });

  it("tells the AI the rule, for every kind of jewellery", () => {
    const prompt: string = sent[0].messages[0].content.at(-1).text;
    expect(prompt).toContain('eBay\'s own "No Stone"');
    expect(prompt).toContain("for every kind of jewellery");
  });
});
