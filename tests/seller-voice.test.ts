import { describe, expect, it } from "vitest";
import { STYLE_PHRASES } from "@/lib/style-phrases";
import { pickPhrases, PER_KIND } from "@/lib/style-rotation";
import { phraseBlocks, phrasesSchema } from "@/lib/style-phrase-blocks";
import { formatDescription } from "@/lib/description-format";

describe("the seller's phrase bank (her drafts, 28 Oct 2026)", () => {
  it("holds all her phrases once each, sorted by kind", () => {
    expect(STYLE_PHRASES.length).toBe(141);
    expect(new Set(STYLE_PHRASES.map((p) => p.id)).size).toBe(141);
    const kinds = new Set(STYLE_PHRASES.map((p) => p.kind));
    for (const k of ["rings", "necklaces", "earrings", "bracelets", "keys", "home", "clothing", "general", "gems"])
      expect(kinds.has(k as never), k).toBe(true);
    for (const p of STYLE_PHRASES) expect(p.text.length).toBeLessThanOrEqual(800);
    expect(STYLE_PHRASES.some((p) => p.text.startsWith("You would be fooling everyone"))).toBe(true);
    expect(STYLE_PHRASES.filter((p) => p.kind === "gems").every((p) => p.stone)).toBe(true);
  });
});

describe("phrases are used in turn", () => {
  it("offers the never-used ones first, a few of every kind, and every stone line", () => {
    const first = pickPhrases({});
    const rings = first.filter((p) => p.kind === "rings");
    expect(rings.map((p) => p.id)).toEqual(["rings-1", "rings-2", "rings-3"]);
    expect(first.filter((p) => p.kind === "gems")).toHaveLength(8);
    expect(phrasesSchema.safeParse(first).success).toBe(true);
    expect(first.length).toBeLessThanOrEqual(8 * PER_KIND + 8);
  });

  it("does not offer a used phrase again until the rest of its kind has had a turn", () => {
    const uses: Record<string, number> = {};
    const seen: string[] = [];
    const total = STYLE_PHRASES.filter((p) => p.kind === "rings").length;
    for (let i = 1; i <= total; i++) {
      const next = pickPhrases(uses).find((p) => p.kind === "rings")!;
      expect(seen).not.toContain(next.id);
      seen.push(next.id);
      uses[next.id] = i;
    }
    // Every ring phrase used once; the round starts again with the oldest.
    expect(pickPhrases(uses).find((p) => p.kind === "rings")!.id).toBe(seen[0]);
  });

  it("tells the model: the tone, not the facts; stones only when named", () => {
    const [block] = phraseBlocks(pickPhrases({})) as { type: "text"; text: string }[];
    expect(block.text).toContain("turn of phrase and tone, NOT its facts");
    expect(block.text).toContain('Put its id in "style_phrase_id"');
    expect(block.text).toMatch(/\[gems-\d+\] \(only if the stone is rose quartz, named by a label or the seller's note\)/);
    expect(phraseBlocks([])).toEqual([]);
  });
});

describe("the description keeps her opening first and a true closing line last", () => {
  it("does not move the opening sentence, even with a colon in it", () => {
    const r = formatDescription(
      "Title\n\nTalk about stylish: this cuff goes with everything.\n\nColor: Gold tone.\n\nBrand: Coach\n\nDiscontinued design. There will be no more like this one.",
    );
    expect(r.text).toBe(
      "Title\n\nTalk about stylish: this cuff goes with everything.\n\nBrand: Coach\n\nColor: Gold tone.\n\nDiscontinued design. There will be no more like this one.",
    );
  });

  it("leaves out the closing line before a design paragraph, and never the opening", () => {
    const r = formatDescription(
      `T\n\nYou can wear this lovely piece to dress up your basic jeans and tees.\n\nBrand: B\n\nCondition: ${"x".repeat(600)}\n\nDesign: ${"y".repeat(60)}\n\nDiscontinued design. There will be no more like this one.`,
    );
    expect(r.dropped[0]).toBe("the closing line");
    expect(r.text).toContain("You can wear this lovely piece");
  });
});

describe("Style instead of Type, without the brand again (28 Oct 2026)", () => {
  it("puts the piece's name where Type stood, drops Type, and never repeats the brand", () => {
    const r = formatDescription(
      "T\n\nOne good thing about this necklace is that you don't need much more.\n\nColor: Gold tone.\n\nType: Long pendant necklace.\n\nStyle: Premier Designs Good As Gold\n\nBrand: Premier Designs\n\nActual Measurements:\n• Length: 35-40 in",
      undefined,
      "Premier Designs",
    );
    expect(r.text).toBe(
      "T\n\nOne good thing about this necklace is that you don't need much more.\n\nBrand: Premier Designs\n\nActual Measurements:\n• Length: 35-40 in\n\nStyle: Good As Gold\n\nColor: Gold tone.",
    );
  });

  it("tells the model the same", async () => {
    const { buildProfiledAnalysisPrompt } = await import("@/lib/prompts");
    const prompt = buildProfiledAnalysisPrompt("auto");
    expect(prompt).toContain("7. Style — the piece's OWN NAME or collection, WITHOUT the brand");
    expect(prompt).toContain('Never write a "Type" line');
    expect(prompt).toContain("Style: Good As Gold");
    expect(prompt).not.toContain("Type: Long pendant necklace");
  });
});
