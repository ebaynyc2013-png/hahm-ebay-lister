import { describe, expect, it } from "vitest";
import {
  isChoiceSet,
  restoreRequiredDrops,
  toAllowedValue,
  COLOR_SYNONYMS,
} from "@/lib/ebay/aspects";
import { aspectPromptLine } from "@/lib/ebay/aspectFill";
import { reconcileAspects } from "@/lib/ebay/publish";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

// eBay's real Style vocabularies, read from its Taxonomy API. The point of
// this file is that they disagree with each other: Style means era and mood in
// a dress and the shape of the piece in jewellery, so nothing about it can be
// hard-coded — the category's own list has to be read and obeyed.
const DRESS_STYLE = [
  "40s", "50s", "60s", "70s", "Anarkali", "Anime", "Art Deco", "Athleisure",
  "Athletic", "Basic", "Beach", "Blouson", "Bohemian", "Casual", "Chic",
  "Clubwear", "Cocktail", "Country", "Fairy", "Flapper", "Formal", "Gothic",
  "Gypsy", "Hawaiian", "Highstreet", "Jacket Dress", "Kaftan", "Lagenlook",
  "Lolita", "Maxi", "Mermaid", "Mini", "Modern", "Nautical", "Novelty",
  "Office Lady", "Peasant", "Pencil Dress", "Pin-Up", "Prairie",
];
const EARRING_STYLE = [
  "Beaded", "Chandelier", "Climber", "Cuff", "Dangle/Drop", "Hoop", "Huggie",
  "Jacket", "Stud", "Tassel",
];
const NECKLACE_STYLE = [
  "Beaded", "Bib", "Chain", "Charm", "Choker", "Collar", "Fringe", "Lariat",
  "Layered", "Locket", "Pendant", "Statement", "Station", "Tennis", "Y-Drop",
];
const DRESS_COLORS = [
  "Beige", "Black", "Blue", "Brown", "Clear", "Gold", "Gray", "Green", "Ivory",
  "Multicolor", "Orange", "Pink", "Purple", "Red", "Silver", "White", "Yellow",
];
// eBay's Necklace Length: a scale, not a vocabulary.
const NECKLACE_LENGTH = Array.from({ length: 25 }, (_, i) => `${i + 12} in`);

const aspect = (
  name: string,
  values: string[],
  over: Partial<AspectMeta> = {},
): AspectMeta => ({
  name,
  required: false,
  usage: "RECOMMENDED",
  mode: "FREE_TEXT",
  cardinality: "SINGLE",
  values,
  ...over,
});

const listing = { title: "A dress", description: "" };
const reconcile = (
  aspects: Record<string, string[]>,
  meta: AspectMeta[],
) => reconcileAspects(aspects, meta, listing, "clothing");

describe("isChoiceSet", () => {
  it("counts a published vocabulary as the set of answers", () => {
    expect(isChoiceSet(aspect("Style", DRESS_STYLE))).toBe(true);
    expect(isChoiceSet(aspect("Style", EARRING_STYLE))).toBe(true);
    expect(isChoiceSet(aspect("Color", DRESS_COLORS))).toBe(true);
  });

  it("does not count a measurement scale", () => {
    // "17.5 in" is a real necklace length whether or not eBay lists it.
    expect(isChoiceSet(aspect("Necklace Length", NECKLACE_LENGTH))).toBe(false);
  });

  it("does not count an identifier, whose catalogue is never complete", () => {
    // eBay lists 4,523 dress brands. A brand it has not heard of is still the
    // brand printed on the tag.
    expect(isChoiceSet(aspect("Brand", ["DKNY", "Calvin Klein"]))).toBe(false);
    expect(isChoiceSet(aspect("Size", ["S", "M", "L"]))).toBe(false);
  });

  it("counts nothing where eBay published nothing", () => {
    expect(isChoiceSet(aspect("Total Carat Weight", []))).toBe(false);
  });
});

describe("what the model is shown", () => {
  it("spells a vocabulary out in full, not twelve of it", () => {
    // The real failure: the model saw the first twelve Style values —
    // 40s … Blouson — and never Casual, so it wrote a phrase of its own.
    const line = aspectPromptLine(
      aspect("Style", DRESS_STYLE, {
        required: true,
        usage: "REQUIRED",
        cardinality: "MULTI",
      }),
    );
    expect(line).toContain("Casual");
    expect(line).toContain("Prairie");
    expect(line).toContain("must be EXACTLY one of");
    expect(line).not.toContain("common values");
  });

  it("says plainly that an aspect may be left out", () => {
    expect(aspectPromptLine(aspect("Style", EARRING_STYLE))).toContain(
      "omit the aspect",
    );
  });

  it("does not recite a catalogue", () => {
    // 4,523 brands teach nothing; they are looked up, not learned.
    const brands = Array.from({ length: 4523 }, (_, i) => `Brand ${i}`);
    const line = aspectPromptLine(aspect("Brand", brands));
    expect(line).toContain("common values");
    expect(line.length).toBeLessThan(400);
  });

  it("leaves a measurement scale as free text", () => {
    const line = aspectPromptLine(aspect("Necklace Length", NECKLACE_LENGTH));
    expect(line).toContain("free text");
    expect(line).not.toContain("must be EXACTLY one of");
  });
});

describe("Style, held to eBay's own words", () => {
  it("drops a true sentence that is not a Style", () => {
    // The real case. "Puff Sleeve Button Front" describes the dress exactly
    // and matches no Style filter on eBay, so the aspect is left empty for
    // the vision pass to fill from the list instead.
    const aspects: Record<string, string[]> = {
      Style: ["Puff Sleeve Button Front"],
    };
    reconcile(aspects, [aspect("Style", DRESS_STYLE)]);
    expect(aspects.Style).toBeUndefined();
  });

  it("keeps eBay's own aesthetic words", () => {
    for (const word of ["Casual", "Bohemian", "Chic", "Prairie", "70s"]) {
      const aspects: Record<string, string[]> = { Style: [word] };
      reconcile(aspects, [aspect("Style", DRESS_STYLE)]);
      expect(aspects.Style).toEqual([word]);
    }
  });

  it("reads the same field differently in jewellery", () => {
    // Stud is a Style for earrings and no Style at all for a dress.
    const earring: Record<string, string[]> = { Style: ["Stud"] };
    reconcile(earring, [aspect("Style", EARRING_STYLE)]);
    expect(earring.Style).toEqual(["Stud"]);

    const necklace: Record<string, string[]> = { Style: ["Choker"] };
    reconcile(necklace, [aspect("Style", NECKLACE_STYLE)]);
    expect(necklace.Style).toEqual(["Choker"]);

    const dress: Record<string, string[]> = { Style: ["Stud"] };
    reconcile(dress, [aspect("Style", DRESS_STYLE)]);
    expect(dress.Style).toBeUndefined();
  });

  it("keeps the values it can place and drops the rest", () => {
    const aspects: Record<string, string[]> = {
      Style: ["Bohemian", "Puff Sleeve", "Prairie"],
    };
    reconcile(aspects, [
      aspect("Style", DRESS_STYLE, { cardinality: "MULTI" }),
    ]);
    expect(aspects.Style).toEqual(["Bohemian", "Prairie"]);
  });
});

describe("what dropping must not swallow", () => {
  it("keeps a measurement eBay happens not to list", () => {
    const aspects: Record<string, string[]> = { "Necklace Length": ["17.5 in"] };
    reconcile(aspects, [aspect("Necklace Length", NECKLACE_LENGTH)]);
    expect(aspects["Necklace Length"]).toEqual(["17.5 in"]);
  });

  it("keeps a brand read off the label", () => {
    const aspects: Record<string, string[]> = { Brand: ["DKNY Jeans"] };
    reconcile(aspects, [aspect("Brand", ["DKNY", "Calvin Klein"])]);
    expect(aspects.Brand).toEqual(["DKNY Jeans"]);
  });

  it("still sends a shade home rather than dropping it", () => {
    const aspects: Record<string, string[]> = { Color: ["Navy"] };
    reconcile(aspects, [aspect("Color", DRESS_COLORS)]);
    expect(aspects.Color).toEqual(["Blue"]);
  });

  it("drops a colour eBay has no word for at all", () => {
    // Teal sits between Blue and Green; neither is the answer, and a word
    // eBay does not publish filters nothing.
    const aspects: Record<string, string[]> = { Color: ["Teal"] };
    reconcile(aspects, [aspect("Color", DRESS_COLORS)]);
    expect(aspects.Color).toBeUndefined();
  });

  it("is idempotent, since prepare now runs it twice", () => {
    const meta = [aspect("Style", DRESS_STYLE), aspect("Color", DRESS_COLORS)];
    const aspects: Record<string, string[]> = {
      Style: ["Bohemian"],
      Color: ["Navy"],
    };
    reconcile(aspects, meta);
    const once = JSON.stringify(aspects);
    reconcile(aspects, meta);
    expect(JSON.stringify(aspects)).toBe(once);
  });
});

describe("what reconcileAspects hands back", () => {
  it("reports what it took out, so prepare can put it back", () => {
    // Taking a value out is how an aspect is handed to the vision pass. If
    // that pass finds nothing either, prepare restores these rather than
    // publishing a REQUIRED field empty.
    const aspects: Record<string, string[]> = {
      Style: ["Puff Sleeve Button Front"],
      Color: ["Teal"],
    };
    const dropped = reconcile(aspects, [
      aspect("Style", DRESS_STYLE),
      aspect("Color", DRESS_COLORS),
    ]);
    expect(dropped).toEqual({
      Style: ["Puff Sleeve Button Front"],
      Color: ["Teal"],
    });
  });

  it("never offers back a menu value eBay would reject", () => {
    // A SELECTION_ONLY value off the menu fails the publish outright, so it
    // is gone for good rather than restorable.
    const aspects: Record<string, string[]> = { Season: ["Monsoon"] };
    const dropped = reconcile(aspects, [
      aspect("Season", ["Fall", "Spring", "Summer", "Winter"], {
        mode: "SELECTION_ONLY",
      }),
    ]);
    expect(aspects.Season).toBeUndefined();
    expect(dropped).toEqual({});
  });

  it("hands nothing back when everything was placed", () => {
    const aspects: Record<string, string[]> = { Style: ["Bohemian"] };
    expect(reconcile(aspects, [aspect("Style", DRESS_STYLE)])).toEqual({});
  });
});

describe("restoring what eBay had no word for", () => {
  const meta = [
    aspect("Style", DRESS_STYLE, { required: true }),
    aspect("Material", ["Cotton", "Linen", "Silk"]),
  ];

  it("leaves a RECOMMENDED aspect empty rather than putting prose back", () => {
    // The regression this guards. eBay's Material list for a dress is fibre
    // content and has no "Denim" — denim is a weave and goes to Fabric Type.
    // A blanket restore quietly put "Denim" back under Material.
    const aspects: Record<string, string[]> = {};
    restoreRequiredDrops(aspects, { Material: ["Denim"] }, meta);
    expect(aspects.Material).toBeUndefined();
  });

  it("fills a REQUIRED aspect rather than publishing it blank", () => {
    const aspects: Record<string, string[]> = {};
    restoreRequiredDrops(aspects, { Style: ["Puff Sleeve Button Front"] }, meta);
    expect(aspects.Style).toEqual(["Puff Sleeve Button Front"]);
  });

  it("never overwrites what the vision pass managed to choose", () => {
    const aspects: Record<string, string[]> = { Style: ["Casual"] };
    restoreRequiredDrops(aspects, { Style: ["Puff Sleeve Button Front"] }, meta);
    expect(aspects.Style).toEqual(["Casual"]);
  });
});

describe("toAllowedValue", () => {
  it("returns eBay's word, or nothing", () => {
    expect(toAllowedValue("Casual", DRESS_STYLE)).toBe("Casual");
    expect(toAllowedValue("Puff Sleeve Button Front", DRESS_STYLE)).toBeNull();
    expect(toAllowedValue("Light Blue", DRESS_COLORS)).toBe("Blue");
    expect(toAllowedValue("Navy", DRESS_COLORS, COLOR_SYNONYMS)).toBe("Blue");
    expect(toAllowedValue("Teal", DRESS_COLORS, COLOR_SYNONYMS)).toBeNull();
  });
});
