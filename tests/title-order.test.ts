import { describe, expect, it } from "vitest";
import { AI_LISTING_SCHEMA, FACTS_BEFORE_TITLE } from "@/lib/ai-schema";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";

const order = Object.keys(AI_LISTING_SCHEMA.properties);

describe("the order the analysis model writes in", () => {
  it("settles every fact before it writes the title", () => {
    // The model writes fields in schema order and cannot look ahead. With the
    // title first, a denim shirt dress was titled "Dress Shirt" while its own
    // item_type, written a line later, said Dress.
    const title = order.indexOf("title");
    for (const fact of FACTS_BEFORE_TITLE)
      expect(order.indexOf(fact), fact).toBeLessThan(title);
  });

  it("writes the description after the title it opens with", () => {
    expect(order.indexOf("description")).toBeGreaterThan(order.indexOf("title"));
  });

  it("still requires every field it declares", () => {
    expect([...AI_LISTING_SCHEMA.required].sort()).toEqual([...order].sort());
  });
});

describe("the title rules in the prompt", () => {
  const prompt = buildProfiledAnalysisPrompt("clothing");

  it("carries the seller's word order", () => {
    const at = (s: string) => prompt.indexOf(s);
    // Vintage+era, brand, colour, distinguishing, collection, item word, size,
    // details, second variant, damaged, aesthetics — in that order.
    const steps = [
      "1. Vintage and era",
      "2. Brand",
      "3. Color",
      "4. What tells this piece apart",
      "5. Collection or line name",
      "6. The item word",
      "7. Size or measurement",
      "8. Construction details",
      "9. A second variant",
      '10. "Damaged", "For Parts" or "New With Tags"',
      "11. Aesthetic tail",
    ];
    for (const s of steps) expect(at(s), s).toBeGreaterThan(-1);
    for (let i = 1; i < steps.length; i++)
      expect(at(steps[i])).toBeGreaterThan(at(steps[i - 1]));
  });

  it("carries the trimming order", () => {
    const block = prompt.slice(prompt.indexOf("WHEN THE TITLE IS OVER 80"));
    const at = (s: string) => block.indexOf(s);
    expect(at("1. a word that appears twice")).toBeLessThan(at('2. the word "Size"'));
    expect(at('2. the word "Size"')).toBeLessThan(at("3. the construction detail"));
    expect(at("3. the construction detail")).toBeLessThan(at("4. the aesthetic tail"));
    expect(at("4. the aesthetic tail")).toBeLessThan(at("5. the full size word"));
  });

  it("trims a repeated word first, never the second variant itself", () => {
    // "Denim Jacket Jeans Jacket" loses the second Jacket, not "Jeans Jacket".
    const block = prompt.slice(prompt.indexOf("WHEN THE TITLE IS OVER 80"));
    expect(block).toContain('"Denim Jacket Jeans Jacket" becomes "Denim Jacket Jeans"');
    expect(block).toContain("The second variant of the item word is NOT removed");
    expect(block).not.toContain("1. the second variant");
  });

  it("asks for both shoe sizes and never for gender or condition", () => {
    expect(prompt).toContain("6.5 EU 37");
    // Room for the size the program adds, or it is left out.
    expect(prompt).toContain("keep a shoe title to 71 characters or fewer");
    expect(prompt).toContain('"Women\'s", "Womens", "Woman", "Ladies"');
    expect(prompt).toContain('"Barbie" or "Gypsy"');
  });

  it("no longer tells the model to avoid a fixed order", () => {
    // The old section said the opposite of the seller's rules.
    expect(prompt).not.toContain("Do not use one fixed title formula");
    expect(prompt).not.toContain("universal field order");
  });
});
