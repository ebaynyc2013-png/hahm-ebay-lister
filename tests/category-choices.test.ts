import { describe, expect, it, vi } from "vitest";
import type { AspectMeta, CategorySuggestion } from "@/lib/ebay/taxonomy";

const sent: any[] = [];
let reply: unknown = {};

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

const PAINTINGS: CategorySuggestion = { id: "551", name: "Paintings", path: "Art > Paintings" };
const COLLAGE: CategorySuggestion = {
  id: "554",
  name: "Mixed Media Art & Collage Art",
  path: "Art > Mixed Media Art & Collage Art",
};
const PRINTS: CategorySuggestion = { id: "360", name: "Art Prints", path: "Art > Art Prints" };
const GUITARS: CategorySuggestion = {
  id: "4713",
  name: "Bass Guitars",
  path: "Musical Instruments & Gear > Guitars & Basses > Bass Guitars",
};

const aspect = (
  name: string,
  values: string[],
  usage: AspectMeta["usage"] = "REQUIRED",
): AspectMeta => ({
  name,
  required: usage === "REQUIRED",
  usage,
  mode: "FREE_TEXT",
  cardinality: "SINGLE",
  values,
});

vi.mock("@/lib/ebay/taxonomy", () => ({
  // The real painting: the search found Paintings first, yet 554 was chosen.
  suggestLeafCategories: vi.fn(async () => [PAINTINGS, COLLAGE, PRINTS, GUITARS]),
  categoryAspects: vi.fn(async (id: string) =>
    id === "554"
      ? [aspect("Type", ["Assemblage", "Collage", "Mosaic"]), aspect("Style", ["Abstract"], "RECOMMENDED")]
      : id === "551"
        ? [aspect("Type", ["Painting"]), aspect("Brand", [])]
        : [aspect("Brand", [])],
  ),
}));

const { describeAspects, cleanAlternatives, selectBestLeafCategory } = await import(
  "@/lib/ebay/categorySelect"
);

describe("what the category model sees of each candidate", () => {
  it("shows a required field's own eBay words", () => {
    expect(
      describeAspects([aspect("Type", ["Assemblage", "Collage", "Mosaic"])]).required,
    ).toEqual(["Type — only one of: Assemblage | Collage | Mosaic"]);
  });

  it("names a read-off-the-item field without pretending it has a list", () => {
    expect(describeAspects([aspect("Brand", ["Nike", "Zara"])]).required).toEqual(["Brand"]);
  });

  it("samples a long list instead of pasting it", () => {
    const many = Array.from({ length: 120 }, (_, i) => `Style ${String.fromCharCode(65 + (i % 26))}${i}`);
    const [line] = describeAspects([aspect("Style", many)]).required;
    expect(line).toContain("one of 120 eBay values");
    expect(line.length).toBeLessThan(400);
  });

  it("lists recommended fields by name", () => {
    expect(
      describeAspects([aspect("Style", ["Abstract"], "RECOMMENDED")]).recommended,
    ).toEqual(["Style"]);
  });
});

describe("the alternates the seller can switch to", () => {
  const list = [PAINTINGS, COLLAGE, PRINTS, GUITARS];

  it("keeps only real candidates, never the pick, no repeats, at most three", () => {
    const out = cleanAlternatives(
      [
        { categoryId: "551", warning: "" },
        { categoryId: "554", warning: "Type offers only Assemblage, Collage, Mosaic" },
        { categoryId: "554", warning: "" },
        { categoryId: "999", warning: "" },
        { categoryId: "360", warning: "" },
        { categoryId: "4713", warning: "" },
        { categoryId: "551", warning: "" },
      ],
      list,
      "551",
    );
    expect(out.map((a) => a.id)).toEqual(["554", "360", "4713"]);
    expect(out[0].warning).toBe("Type offers only Assemblage, Collage, Mosaic");
    expect(out[0].path).toBe("Art > Mixed Media Art & Collage Art");
  });

  it("copes with nothing", () => {
    expect(cleanAlternatives(undefined, list, "551")).toEqual([]);
  });
});

describe("choosing the category", () => {
  it("tells the model the required words and asks for alternates", async () => {
    sent.length = 0;
    reply = {
      reason: "An acrylic and resin painting on canvas.",
      categoryId: "551",
      alternatives: [
        { categoryId: "554", warning: "Type offers only Assemblage, Collage, Mosaic — none is a painting" },
        { categoryId: "551", warning: "" },
      ],
      confidence: "high",
    };
    const out = await selectBestLeafCategory(
      { title: "Colie Bloom Black White Silver Resin Crystal Geode Painting", description: "" },
      [],
    );
    const params = sent[0];
    const prompt: string = params.messages[0].content.at(-1).text;
    expect(prompt).toContain("Type — only one of: Assemblage | Collage | Mosaic");
    expect(prompt).toContain("that category is WRONG for it");
    expect(prompt).toContain("ALTERNATIVES");

    const props = Object.keys(params.output_config.format.schema.properties);
    expect(props.indexOf("reason")).toBeLessThan(props.indexOf("categoryId"));
    expect(props).toContain("alternatives");

    expect(out.selected.id).toBe("551");
    expect(out.alternatives.map((a) => a.id)).toEqual(["554"]);
    expect(out.alternatives[0].warning).toContain("none is a painting");
    expect(out.reason).toBe("An acrylic and resin painting on canvas.");
  });

  it("still chooses when the model offers no alternates", async () => {
    reply = { reason: "Clearly a painting.", categoryId: "551", alternatives: [], confidence: "high" };
    const out = await selectBestLeafCategory({ title: "Oil painting", description: "" }, []);
    expect(out.selected.id).toBe("551");
    expect(out.alternatives).toEqual([]);
  });
});
