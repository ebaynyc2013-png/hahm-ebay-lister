import { describe, expect, it } from "vitest";
import { isFootwear, shoeSizesInTitle } from "@/lib/title-shoe-size";
import { optimizeTitle } from "@/lib/titleOptimizer";
import type { ListingResult } from "@/lib/types";

const heels: ListingResult = {
  title: "",
  description: "",
  item_type: "Heels",
  category_hint: "women's slingback heels",
};
const RED = "Richard Tyler Red Satin Crystal Strappy Slingback Heels";

// The seller's form since 21 Nov 2026: "Size 6.5 EU 37" ("it should say
// Size 6 EU 36"); from 26 Oct it was "6.5 37".
describe("shoe titles carry both sizes, from eBay's chart", () => {
  it("adds the US size to a European one", () => {
    // The real red heels: the insole says 37.
    expect(shoeSizesInTitle(`${RED} EU 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} 37 EU`, heels)).toBe(`${RED} Size 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} Size 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} Size EU 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
  });

  it("adds the EU size to a marked US one", () => {
    expect(shoeSizesInTitle(`${RED} US 6.5`, heels)).toBe(`${RED} Size 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} Size US 6.5`, heels)).toBe(`${RED} Size 6.5 EU 37`);
  });

  it("corrects a US size the chart disagrees with", () => {
    expect(shoeSizesInTitle(`${RED} 7 EU 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} 7 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
  });

  it("leaves a correct pair exactly as it is, and never writes Size twice", () => {
    expect(shoeSizesInTitle(`${RED} Size 6.5 EU 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} Size 6.5 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
  });

  it("rewrites the old forms into the new one", () => {
    expect(shoeSizesInTitle(`${RED} 6.5 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} 6.5 EU 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} US 6.5 EU 37`, heels)).toBe(`${RED} Size 6.5 EU 37`);
  });

  it("never reads a model number as a size", () => {
    const max = "Nike Air Max 90 Sneakers White 38";
    expect(shoeSizesInTitle(max, { ...heels, item_type: "Sneakers" })).toBe(max);
  });

  it("reads the men's chart only when the listing says men's", () => {
    // EU 37 is women's US 6.5 but men's US 4.5.
    const mens = { ...heels, item_type: "Oxfords", item_specifics: { Department: "Men" } };
    expect(shoeSizesInTitle("Allen Edmonds Brown Leather Oxfords EU 37", mens)).toBe(
      "Allen Edmonds Brown Leather Oxfords Size 4.5 EU 37",
    );
  });

  it("reads a width letter as a US size and keeps the letter", () => {
    // The real Michael Kors pumps: the insole says 7M.
    const mk = "MICHAEL Michael Kors Black Suede Studded Buckle Pointed Pumps 7M Heels";
    const pumps = { ...heels, item_type: "Pumps" };
    // With "Size" it would be 82 characters: the word "Size" goes, both sizes stay.
    expect(shoeSizesInTitle(mk, pumps)).toBe(
      "MICHAEL Michael Kors Black Suede Studded Buckle Pointed Pumps 7M EU 37.5 Heels",
    );
    expect(shoeSizesInTitle(`${RED} Size 8.5W`, heels)).toBe(`${RED} Size 8.5W EU 39`);
    expect(shoeSizesInTitle(`${RED} 9 N`, heels)).toBe(`${RED} Size 9N EU 39.5`);
    expect(shoeSizesInTitle(`${RED} US 7M`, heels)).toBe(`${RED} Size 7M EU 37.5`);
  });

  it("leaves a sized pair with a width letter alone, and corrects only the number", () => {
    expect(shoeSizesInTitle(`${RED} Size 7M EU 37.5`, heels)).toBe(`${RED} Size 7M EU 37.5`);
    expect(shoeSizesInTitle(`${RED} 7M 37.5`, heels)).toBe(`${RED} Size 7M EU 37.5`);
    expect(shoeSizesInTitle(`${RED} 7M EU 37`, heels)).toBe(`${RED} Size 6.5M EU 37`);
  });

  it("does not mistake metres or a lower-case m for a width", () => {
    expect(shoeSizesInTitle(`${RED} 7m`, heels)).toBe(`${RED} 7m`);
  });

  it("never guesses a bare small number, which could be US or UK", () => {
    expect(shoeSizesInTitle(`${RED} Size 7`, heels)).toBe(`${RED} Size 7`);
  });

  it("does nothing to anything that is not a shoe", () => {
    const jeans: ListingResult = { title: "", description: "", item_type: "Boot Cut Jeans" };
    expect(isFootwear(jeans)).toBe(false);
    expect(shoeSizesInTitle("Levi's 517 Boot Cut Jeans Size 34", jeans)).toBe(
      "Levi's 517 Boot Cut Jeans Size 34",
    );
  });

  it("runs as part of the title clean-up", () => {
    expect(optimizeTitle({ ...heels, title: `${RED} EU 37` })).toBe(`${RED} Size 6.5 EU 37`);
  });
});

describe("both shoe sizes always stay (the seller, 21 Nov 2026)", () => {
  // The real Chloé sandals in the working copy: the title went out with the
  // European 37 only.
  const chloe = "Chloe Yellow Leather Heeled Sandals 37 Crossover Round Buckle Block Heel Retro";
  const sandals: ListingResult = {
    title: "",
    description: "",
    item_type: "Sandals",
    size: "EU 37",
    aesthetics: ["Retro"],
  };

  it("a bare European number is sized when it is the size the listing read", () => {
    const out = shoeSizesInTitle(chloe, sandals);
    expect(out.length).toBeLessThanOrEqual(80);
    // No room for "Size 6.5 EU 37": the aesthetic tail went first, then the
    // word "Size" (her trimming order) — both sizes and every other word stayed.
    expect(out).toBe("Chloe Yellow Leather Heeled Sandals 6.5 EU 37 Crossover Round Buckle Block Heel");
  });

  it("with room, the full form", () => {
    const short = "Chloe Yellow Leather Sandals 37 Crossover Buckle Block Heel Retro";
    expect(shoeSizesInTitle(short, sandals)).toBe(
      "Chloe Yellow Leather Sandals Size 6.5 EU 37 Crossover Buckle Block Heel Retro",
    );
  });

  it("the same bare number is left alone when the listing read another size", () => {
    expect(shoeSizesInTitle(chloe, { ...sandals, size: "EU 38" })).toBe(chloe);
    expect(shoeSizesInTitle(chloe, { ...sandals, size: "" })).toBe(chloe);
  });

  it("reads the EU Shoe Size field when the size has no mark", () => {
    const out = shoeSizesInTitle(chloe, { ...sandals, size: "", item_specifics: { "EU Shoe Size": "37" } });
    expect(out).toContain("6.5 EU 37");
  });

  it("when the sizes come last, words just before them go — never the sizes", () => {
    const long = "Christian Louboutin Black Patent Leather So Kate Pumps Stiletto Pointed Toe EU 37";
    expect(shoeSizesInTitle(long, { ...heels, item_type: "Pumps" })).toBe(
      "Christian Louboutin Black Patent Leather So Kate Pumps Stiletto 6.5 EU 37",
    );
  });

  it("with no aesthetic to drop, the word Size goes, then words from the end — never a size", () => {
    const long = "Christian Louboutin Black Patent Leather So Kate Pumps Stiletto Pointed Toe EU 37";
    const pumps = { ...heels, item_type: "Pumps" };
    const out = shoeSizesInTitle(long, pumps);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toContain("6.5 EU 37");

    const middle = "Christian Louboutin Black Patent So Kate Pumps EU 37 Stiletto Pointed Toe Classic Party";
    const fitted = shoeSizesInTitle(middle, pumps);
    expect(fitted.length).toBeLessThanOrEqual(80);
    expect(fitted).toContain("6.5 EU 37");
    expect(fitted.startsWith("Christian Louboutin Black Patent So Kate Pumps")).toBe(true);
  });

  it("runs as part of the title clean-up", () => {
    const out = optimizeTitle({ ...sandals, title: chloe });
    expect(out).toBe("Chloe Yellow Leather Heeled Sandals 6.5 EU 37 Crossover Round Buckle Block Heel");
  });
});

describe("New With Tags", () => {
  it("stays in the title, like Damaged and For Parts", () => {
    const t = "Anthropologie Green Wrap Dress M Medium New With Tags";
    expect(optimizeTitle({ title: t, description: "" })).toBe(t);
    expect(optimizeTitle({ title: "Zara Black Blazer S Small NWT", description: "" })).toBe(
      "Zara Black Blazer S Small NWT",
    );
  });
});
