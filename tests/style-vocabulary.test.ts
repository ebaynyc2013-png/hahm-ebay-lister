import { describe, expect, it } from "vitest";
import {
  isChoiceSet,
  toAllowedValue,
  COLOR_SYNONYMS,
  MAX_MULTI_VALUES,
} from "@/lib/ebay/aspects";
import { allowedValuesFrom, aspectPromptLine } from "@/lib/ebay/aspectFill";
import { reconcileAspects } from "@/lib/ebay/publish";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

// eBay's real Style vocabularies, read from its Taxonomy API. The point of
// this file is that they disagree with each other: Style means era and mood in
// a dress and the shape of the piece in jewellery, so nothing about it can be
// hard-coded — the category's own list has to be read and obeyed.
// All 63, as eBay returns them for Women's Dresses (63861). The full list
// matters here: the first forty stop at Prairie, and Shirt Dress, Western and
// Trapeze & Swing — the ones these tests turn on — are all past it.
const DRESS_STYLE = [
  "40s", "50s", "60s", "70s", "Anarkali", "Anime", "Art Deco", "Athleisure",
  "Athletic", "Basic", "Beach", "Blouson", "Bohemian", "Casual", "Chic",
  "Clubwear", "Cocktail", "Country", "Fairy", "Flapper", "Formal", "Gothic",
  "Gypsy", "Hawaiian", "Highstreet", "Jacket Dress", "Kaftan", "Lagenlook",
  "Lolita", "Maxi", "Mermaid", "Mini", "Modern", "Nautical", "Novelty",
  "Office Lady", "Peasant", "Pencil Dress", "Pin-Up", "Prairie", "Preppy",
  "Princess", "Prom", "Punk", "Resort", "Retro", "Rockabilly", "Safari",
  "Sailor", "Sheath", "Shirt Dress", "Slip Dress", "Streetwear", "Sundress",
  "Sweater Dress", "Tank Dress", "Traditional", "Trapeze & Swing",
  "T-Shirt Dress", "Victorian", "Vintage", "Western", "Wrap Dress",
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

it("leaves room for honest values without room to stuff", () => {
  // eBay allows 30 values on a multi-value aspect. Our own cap sits well
  // below it on purpose: its search manipulation policy forbids values that
  // do not describe the item, so the cap is headroom for true answers, not
  // a target to fill.
  expect(MAX_MULTI_VALUES).toBeGreaterThanOrEqual(6);
  expect(MAX_MULTI_VALUES).toBeLessThanOrEqual(12);
});

it("carries eBay's lists at the length eBay returns them", () => {
  // A truncated copy of a vocabulary makes these tests pass against words
  // that are not really there, which is exactly the bug being fixed.
  expect(DRESS_STYLE).toHaveLength(63);
  expect(EARRING_STYLE).toHaveLength(10);
  expect(NECKLACE_STYLE).toHaveLength(15);
  expect(DRESS_COLORS).toHaveLength(17);
});

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

describe("eBay's own values, whole, and as many as apply", () => {
  const multi = (name: string, values: string[]) =>
    aspect(name, values, { cardinality: "MULTI" });

  it("keeps a compound value in one piece", () => {
    // The split runs on "/" and "&", and eBay's own vocabularies are full of
    // both. Split first and "Dangle/Drop" becomes two words eBay never heard.
    for (const [name, value, values] of [
      ["Style", "Dangle/Drop", EARRING_STYLE],
      ["Closure", "Hook & Eye", ["Button", "Hook & Eye", "Zip"]],
      ["Style", "Trapeze & Swing", DRESS_STYLE],
      ["Theme", "Animals & Insects", ["Animals & Insects", "Art", "Beach"]],
      ["Pattern", "Argyle/Diamond", ["Argyle/Diamond", "Floral", "Solid"]],
    ] as const)
      expect(allowedValuesFrom(value, multi(name, [...values]))).toEqual([
        value,
      ]);
  });

  it("puts a compound value back together when the model split it", () => {
    expect(
      allowedValuesFrom(["Hook", "Eye"], multi("Closure", ["Hook & Eye"])),
    ).toEqual(["Hook & Eye"]);
  });

  it("takes every value out of the one string the schema allows", () => {
    // The model cannot return an array through the output schema, so it is
    // asked for "Collared | Pockets" and every MULTI aspect was going out
    // with a single word.
    expect(
      allowedValuesFrom(
        "Collared | Pockets | Lined",
        multi("Features", ["Collared", "Pockets", "Lined", "Sheer"]),
      ),
    ).toEqual(["Collared", "Pockets", "Lined"]);
    expect(
      allowedValuesFrom("Casual | Shirt Dress | Western", multi("Style", DRESS_STYLE)),
    ).toEqual(["Casual", "Shirt Dress", "Western"]);
  });

  it("keeps the values eBay knows and drops the rest", () => {
    expect(
      allowedValuesFrom(
        "Pockets | Puff Sleeve Button Front",
        multi("Features", ["Collared", "Pockets"]),
      ),
    ).toEqual(["Pockets"]);
  });

  it("gives nothing back when eBay knows none of it", () => {
    expect(
      allowedValuesFrom("Puff Sleeve Button Front", multi("Style", DRESS_STYLE)),
    ).toEqual([]);
  });

  it("still sends a shade home on a colour aspect", () => {
    expect(allowedValuesFrom("Navy", aspect("Color", DRESS_COLORS))).toEqual([
      "Blue",
    ]);
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
