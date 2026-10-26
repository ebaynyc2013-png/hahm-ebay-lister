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

describe("shoe titles carry both sizes, from eBay's chart", () => {
  it("adds the US size to a European one", () => {
    // The real red heels: the insole says 37.
    expect(shoeSizesInTitle(`${RED} EU 37`, heels)).toBe(`${RED} 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} 37 EU`, heels)).toBe(`${RED} 6.5 EU 37`);
    expect(shoeSizesInTitle(`${RED} Size 37`, heels)).toBe(
      `${RED} Size 6.5 EU 37`,
    );
  });

  it("adds the EU size to a marked US one", () => {
    expect(shoeSizesInTitle(`${RED} US 6.5`, heels)).toBe(`${RED} 6.5 EU 37`);
  });

  it("corrects a US size the chart disagrees with", () => {
    expect(shoeSizesInTitle(`${RED} 7 EU 37`, heels)).toBe(`${RED} 6.5 EU 37`);
  });

  it("leaves a correct pair exactly as it is", () => {
    expect(shoeSizesInTitle(`${RED} 6.5 EU 37`, heels)).toBe(`${RED} 6.5 EU 37`);
  });

  it("reads the men's chart only when the listing says men's", () => {
    // EU 37 is women's US 6.5 but men's US 4.5.
    const mens = { ...heels, item_type: "Oxfords", item_specifics: { Department: "Men" } };
    expect(shoeSizesInTitle("Allen Edmonds Brown Leather Oxfords EU 37", mens)).toBe(
      "Allen Edmonds Brown Leather Oxfords 4.5 EU 37",
    );
  });

  it("reads a width letter as a US size and keeps the letter", () => {
    // The real Michael Kors pumps: the insole says 7M.
    const mk = "MICHAEL Michael Kors Black Suede Studded Buckle Pointed Pumps 7M Heels";
    const pumps = { ...heels, item_type: "Pumps" };
    expect(shoeSizesInTitle(mk, pumps)).toBe(
      "MICHAEL Michael Kors Black Suede Studded Buckle Pointed Pumps 7M EU 37.5 Heels",
    );
    expect(shoeSizesInTitle(`${RED} Size 8.5W`, heels)).toBe(`${RED} Size 8.5W EU 39`);
    expect(shoeSizesInTitle(`${RED} 9 N`, heels)).toBe(`${RED} 9N EU 39.5`);
  });

  it("leaves a sized pair with a width letter alone, and corrects only the number", () => {
    expect(shoeSizesInTitle(`${RED} 7M EU 37.5`, heels)).toBe(`${RED} 7M EU 37.5`);
    expect(shoeSizesInTitle(`${RED} 7M EU 37`, heels)).toBe(`${RED} 6.5M EU 37`);
  });

  it("does not mistake metres or a lower-case m for a width", () => {
    expect(shoeSizesInTitle(`${RED} 7m`, heels)).toBe(`${RED} 7m`);
  });

  it("never guesses a bare small number, which could be US or UK", () => {
    expect(shoeSizesInTitle(`${RED} Size 7`, heels)).toBe(`${RED} Size 7`);
  });

  it("drops the word Size rather than break 80 characters", () => {
    const long = "Christian Louboutin Black Patent Leather So Kate Pumps Stiletto Size 37";
    const out = shoeSizesInTitle(long, { ...heels, item_type: "Pumps" });
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toContain("6.5 EU 37");
  });

  it("does nothing to anything that is not a shoe", () => {
    const jeans: ListingResult = { title: "", description: "", item_type: "Boot Cut Jeans" };
    expect(isFootwear(jeans)).toBe(false);
    expect(shoeSizesInTitle("Levi's 517 Boot Cut Jeans Size 34", jeans)).toBe(
      "Levi's 517 Boot Cut Jeans Size 34",
    );
  });

  it("runs as part of the title clean-up", () => {
    expect(optimizeTitle({ ...heels, title: `${RED} EU 37` })).toBe(
      `${RED} 6.5 EU 37`,
    );
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
