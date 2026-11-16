import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESCRIPTION_LIMIT, formatDescription } from "@/lib/description-format";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import { REVISE_RULES } from "@/lib/revise";
import { lookupFacts } from "@/lib/product-lookup";

// The seller's description, 15–16 Nov 2026: a new order, Condition as the
// exact condition plus three sentences, one Details paragraph, no Occasion,
// up to 1000 characters — and no section ever left out but the closing line.

const labels = (text: string) =>
  text
    .split("\n\n")
    .slice(2)
    .map((b) => b.split(":")[0]);

describe("the program puts the sections in her order", () => {
  const r = formatDescription(
    [
      "Title",
      "One good thing about this necklace.",
      "Occasion: Evening.",
      "Style: Coach Good As Gold",
      "Hallmarks: 925.",
      "Closure: Lobster clasp with an extender",
      "Color: Black.",
      "Design: A round pendant.",
      "Actual Measurements:\nLength: 18 in\nWeight: 5 g",
      "Size: M",
      "Notes: Hand finished.",
      "Stones: Blue topaz.",
      "Material: Sterling silver.",
      "Condition: Excellent.",
      "Brand: Coach",
      "Discontinued design.",
    ].join("\n\n"),
    undefined,
    "Coach",
  );

  it("opening, Brand, Condition, measurements, Size, Color, Material, Stones, Hallmarks, Details, Style, closing", () => {
    expect(r.text.split("\n\n")[1]).toBe("One good thing about this necklace.");
    expect(labels(r.text)).toEqual([
      "Brand",
      "Condition",
      "Length",
      "Size",
      "Color",
      "Material",
      "Stones",
      "Hallmarks",
      "Details",
      "Notes",
      "Style",
      "Discontinued design.",
    ]);
  });

  it("has no Occasion section", () => {
    expect(r.text).not.toMatch(/Occasion/);
  });

  it("joins Design and Closure into one Details paragraph, the details first", () => {
    expect(r.text).toContain("Details: A round pendant. Lobster clasp with an extender.");
    expect(r.text).not.toMatch(/\n(?:Design|Closure):/);
  });

  it("still takes the brand out of Style, now near the end", () => {
    expect(r.text).toContain("Style: Good As Gold\n\nDiscontinued design.");
  });

  it("a Pendant size is still a measurement", () => {
    const m = formatDescription("T\n\nCondition: Fine.\n\nPendant: Approximately 2 W x 2.75 H in\n\nLength: 18 in");
    expect(m.text).toBe("T\n\nCondition: Fine.\n\nPendant: Approximately 2 W x 2.75 H in\nLength: 18 in");
  });
});

describe("over the limit, nothing but the closing line is left out", () => {
  const long = "x".repeat(DESCRIPTION_LIMIT);
  it("the closing line goes; every section stays; the text is still over", () => {
    const r = formatDescription(
      `T\n\nOpening.\n\nBrand: B\n\nCondition: ${long}\n\nColor: Red.\n\nDetails: Snap button.\n\nStyle: Wheaton\n\nDiscontinued design.`,
    );
    expect(r.dropped).toEqual(["the closing line"]);
    expect(r.over).toBe(true);
    expect(labels(r.text)).toEqual(["Brand", "Condition", "Color", "Details", "Style"]);
  });
  it("within the limit, the closing line stays", () => {
    const r = formatDescription("T\n\nOpening.\n\nBrand: B\n\nCondition: Fine.\n\nDiscontinued design.");
    expect(r.dropped).toEqual([]);
    expect(r.text.endsWith("Discontinued design.")).toBe(true);
  });
  it("no closing line: nothing is left out at all", () => {
    const r = formatDescription(`T\n\nBrand: B\n\nCondition: ${long}\n\nDesign: Pretty.`);
    expect(r.dropped).toEqual([]);
    expect(r.over).toBe(true);
    expect(r.text).toContain("Details: Pretty.");
  });
});

describe("the writer is told the same, strictly", () => {
  const p = buildProfiledAnalysisPrompt("auto");
  it("the new section order", () => {
    const from = p.indexOf("SECTION ORDER");
    const order = [
      "3. Brand",
      "4. Condition",
      "5. The measurements",
      "6. Size",
      "7. Color",
      "8. Material",
      "9. Stones",
      "10. Hallmarks",
      "11. Details",
      "12. Style",
      "13. Optionally, one closing line",
    ].map((s) => p.indexOf(s, from));
    expect(order.every((i) => i > from)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(p).toContain("There is NO Occasion section");
    expect(p).not.toContain("13. Occasion");
  });
  it("Condition: the exact condition, then exactly three more; up to five for heavy damage; works unless Notes say not", () => {
    expect(p).toContain("Then EXACTLY THREE more sentences");
    expect(p).toContain("up to FIVE more");
    expect(p).toContain("Assume everything works as it should");
  });
  it("Color with the maker's name; stones named first; small details; Style the piece's name", () => {
    expect(p).toContain('"Color: Pink. The maker calls it Pinkerton."');
    expect(p).toContain("NAME the stone first");
    expect(p).toContain("the small real ones above all");
    expect(p).toContain("12. Style — the piece's OWN NAME");
  });
  it("what to shorten first, and a check before returning", () => {
    expect(p).toContain("1. leave out the closing line; 2. put the Style name into the Details paragraph");
    expect(p).toContain("BEFORE YOU RETURN THE DESCRIPTION, CHECK IT SECTION BY SECTION");
  });
  it("the example is in the new order and within the limit", () => {
    const m = p.match(/Example \((\d+) characters\):\n\n([\s\S]*?)\n\nUse other clear/);
    expect(m).not.toBeNull();
    const example = m![2];
    expect(example.length).toBe(Number(m![1]));
    expect(example.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(formatDescription(example).text).toBe(example);
    expect(example).not.toMatch(/\n(?:Occasion|Closure|Design):/);
  });
});

describe("Update with notes and the online lookup keep it", () => {
  it("the text update knows the order", () => {
    expect(REVISE_RULES).toContain("Details (one paragraph — the closure, fit, chain and bail are in it), Style");
    expect(REVISE_RULES).toContain("No Occasion, Design, Closure or Type section");
  });
  it("the maker's colour name after the plain colour", () => {
    const f = lookupFacts({
      status: "found",
      source: { site: "Tiffany", title: "x", url: "https://www.tiffany.com/x" },
      official_color: "Tiffany Blue",
    });
    expect(f).toContain('"Color: Pink. The maker calls it Tiffany Blue."');
  });
});

describe("the draft screen shows the overflow in red", () => {
  const card = readFileSync("app/DraftCard.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  it("right under the description box", () => {
    expect(card).toContain('className="hint over-limit"');
    expect(card).toContain("Over {DESCRIPTION_LIMIT} by {l.description.length - DESCRIPTION_LIMIT} characters");
    expect(card).toContain("count desc-count");
  });
  it("red, not amber", () => {
    expect(css).toMatch(/\.draft-screen \.hint\.over-limit \{\s*color: var\(--color-danger\);/);
    expect(css).toMatch(/\.df-label \.desc-count\.over \{\s*color: var\(--color-danger\);/);
  });
});

describe("the stone: the same name in the title, the description and the item specifics (16 Nov 2026)", () => {
  it("the writer names it the same way everywhere", () => {
    const p = buildProfiledAnalysisPrompt("auto");
    expect(p).toContain("IN THE TITLE, THE DESCRIPTION'S STONES SECTION AND THE ITEM SPECIFICS ALIKE");
    expect(p).not.toContain("IN THE TITLE the old rule stands");
  });
});
