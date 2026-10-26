import { describe, expect, it, vi } from "vitest";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

let reply: unknown = {};
vi.mock("@/lib/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anthropic")>()),
  getClient: () => ({
    messages: {
      create: async () => ({
        model: "test",
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: "text", text: JSON.stringify(reply) }],
      }),
    },
  }),
}));

const { fillRecommendedAspects } = await import("@/lib/ebay/aspectFill");

const aspect = (name: string, values: string[], cardinality: "SINGLE" | "MULTI" = "MULTI"): AspectMeta => ({
  name,
  required: false,
  usage: "RECOMMENDED",
  mode: "FREE_TEXT",
  cardinality,
  values,
});

// A slice of eBay's real lists for Women's Heels (55793).
const META = [
  aspect("Features", ["Adjustable Strap", "Buckle", "Padded", "Straps"]),
  aspect("Upper Material", ["Leather", "Suede", "Satin"], "SINGLE"),
  aspect("Accents", ["Studded", "Stone", "Rhinestone"]),
];
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const photos = [
  { mediaType: "image/png" as const, data: PNG },
  { mediaType: "image/png" as const, data: PNG },
];
const fact = (name: string, value: string, extra: object = {}) => ({
  name,
  value,
  photoIndices: [1],
  basis: "visible_feature",
  quote: "",
  ...extra,
});

describe("the photo pass says which words it refused and why", () => {
  it("names each refused word with a plain reason", async () => {
    reply = {
      facts: [
        fact("Features", "Buckle | Pointed Toe"), // half eBay's, half not
        fact("Accents", "Gold Hardware"), // none of it eBay's
        fact("Upper Material", "Suede"), // substance, not judged from a look
        fact("Heel Shape", "Kitten"), // not a field offered here
        fact("Accents", "Studded", { photoIndices: [] }), // no photo cited
      ],
    };
    const aspects: Record<string, string[]> = {};
    const r = await fillRecommendedAspects(
      { title: "Black suede pumps", description: "" },
      aspects,
      META,
      "SKU-1",
      photos,
    );
    expect(aspects.Features).toEqual(["Buckle"]);
    expect(r.refusedWords).toEqual([
      { aspect: "Features", value: "Pointed Toe", why: "not an eBay word" },
      { aspect: "Accents", value: "Gold Hardware", why: "not an eBay word" },
      {
        aspect: "Upper Material",
        value: "Suede",
        why: "needs a label or your note, not just a look",
      },
      { aspect: "Heel Shape", value: "Kitten", why: "not a field eBay asks for here" },
      { aspect: "Accents", value: "Studded", why: "no photo cited" },
    ]);
    expect(r.note).toContain('Refused: Features "Pointed Toe" — not an eBay word');
    expect(r.note).toContain("filled 1: Features");
  });
});
