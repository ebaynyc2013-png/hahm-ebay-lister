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

describe("fields her note answers are filled though no photo was cited (1 Nov 2026)", () => {
  it("the Prada trousers: Inseam, Waist Size, Rise and Leg Style go in", async () => {
    const pants = [
      { ...aspect("Inseam", ["Regular", "Short", "Tall", "26 in", "27 in", "28 in"], "SINGLE") },
      { ...aspect("Waist Size", ["27 in", "28 in", "29 in"], "SINGLE") },
      { ...aspect("Rise", ["Low (6.5-8.5 in)", "Mid (8.5-10.5 in)", "High (Greater than 10.5 in)"], "SINGLE") },
      { ...aspect("Leg Style", ["Bootcut", "Skinny", "Straight", "Wide-Leg"], "SINGLE") },
    ];
    reply = {
      facts: [
        fact("Inseam", "27 in", { photoIndices: [], basis: "label", quote: "inseam 27in" }),
        fact("Waist Size", "28 in", { photoIndices: [], basis: "label", quote: "waist 14in" }),
        fact("Rise", "Mid (8.5-10.5 in)", { photoIndices: [] }),
        fact("Leg Style", "Straight", { photoIndices: [] }),
        fact("Inseam", "30 in", { photoIndices: [] }), // not what the note says
      ],
    };
    const aspects: Record<string, string[]> = {};
    const listing = {
      title: "Prada Black Straight Leg Dress Pants",
      description: "Actual Measurements:\n• Waist: 14 in\n• Inseam: 27 in\n• Rise: 9 in\n\nDesign: Straight leg cut.",
    };
    const r = await fillRecommendedAspects(listing, aspects, pants, "SKU", photos);
    expect(aspects).toEqual({
      Inseam: ["27 in"],
      "Waist Size": ["28 in"],
      Rise: ["Mid (8.5-10.5 in)"],
      "Leg Style": ["Straight"],
    });
    expect(r.refusedWords.map((w) => `${w.aspect} ${w.value}`)).toEqual(["Inseam 30 in"]);
  });
});
