import { describe, expect, it } from "vitest";
import {
  AESTHETICS,
  AESTHETICS_WITHOUT_CUES,
  NOT_IN_TITLE,
  aestheticsPromptBlock,
  isAllowedInTitle,
  stripBannedTitleWords,
} from "@/lib/aesthetics";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";

describe("the aesthetics catalogue", () => {
  it("gives every aesthetic something a photograph can settle", () => {
    // A name with no cues is nothing to recognise — it only invites a guess.
    expect(AESTHETICS.length).toBeGreaterThan(50);
    for (const a of AESTHETICS) {
      expect(a.name.trim()).not.toBe("");
      expect(a.cues.trim().length).toBeGreaterThan(20);
    }
  });

  it("keeps the ones the guide never described out of the cued list", () => {
    const cued = new Set(AESTHETICS.map((a) => a.name.toLowerCase()));
    for (const name of AESTHETICS_WITHOUT_CUES)
      expect(cued.has(name.toLowerCase())).toBe(false);
  });

  it("names each aesthetic once", () => {
    const names = AESTHETICS.map((a) => a.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("carries the ones the seller actually sells into", () => {
    const names = AESTHETICS.map((a) => a.name);
    for (const expected of [
      "Cottagecore",
      "Western",
      "Preppy",
      "Office Siren",
      "Y2K Vintage",
      "Gorpcore",
      "Bohemian",
    ])
      expect(names).toContain(expected);
  });

  it("carries the nine that were researched rather than dropped", () => {
    // The guide named these without saying what they look like. Each was
    // looked up separately, so each is recognisable now.
    const names = AESTHETICS.map((a) => a.name);
    for (const expected of [
      "Clean Girl",
      "Coastal Cowgirl",
      "Fishermancore",
      "Scandinavian Minimalism",
      "Cyberpunk",
      "Harajuku",
      "Grunge",
      "Emo",
      "Scene",
    ])
      expect(names).toContain(expected);
  });

  it("leaves only what could not be sourced in the no-cues list", () => {
    // Y3K is gone, judged a slip for Y2K, which is covered twice already.
    expect(AESTHETICS_WITHOUT_CUES).toEqual(["Campcore"]);
    const names = AESTHETICS.map((a) => a.name);
    expect(names).toContain("Y2K Vintage");
    expect(names).toContain("Y2K Style");
    expect(names).not.toContain("Y3K");
  });
});

describe("words that must not reach a title", () => {
  it("keeps Barbie and Gypsy out", () => {
    // Barbie is a trademark and Gypsy is a slur; listings carrying either are
    // taken down. Both stay legal as item specifics — eBay itself offers
    // Gypsy as a dress Style — so this list is deliberately its own.
    expect(NOT_IN_TITLE).toEqual(["Barbie", "Gypsy"]);
    expect(isAllowedInTitle("Barbie")).toBe(false);
    expect(isAllowedInTitle("gypsy")).toBe(false);
    expect(isAllowedInTitle("Bohemian")).toBe(true);
  });

  it("strips them from a finished title and tidies the spacing", () => {
    expect(
      stripBannedTitleWords("Vintage Gypsy Floral Maxi Dress Size M Medium"),
    ).toBe("Vintage Floral Maxi Dress Size M Medium");
    expect(stripBannedTitleWords("Mattel Barbie Pink Jacket Small")).toBe(
      "Mattel Pink Jacket Small",
    );
  });

  it("leaves a word that merely contains one alone", () => {
    expect(stripBannedTitleWords("Barbiecore Pink Set Medium")).toBe(
      "Barbiecore Pink Set Medium",
    );
  });
});

describe("what the analysis model is shown", () => {
  const prompt = buildProfiledAnalysisPrompt("clothing");

  it("carries the whole catalogue, cues and all", () => {
    expect(prompt).toContain("STYLE AESTHETICS");
    expect(prompt).toContain("Cottagecore: florals, puff sleeves, gingham");
    expect(prompt).toContain("Office Siren: late-90s and early-2000s corporate: pencil skirts");
    // The 2026 guide: jewellery and accessory cues, aliases, new entries.
    expect(prompt).toContain("Phoebe Buffay Style (also: Phoebe Buffay): 90s revival");
    expect(prompt).toContain("Academia (also: Light Academia)");
    expect(prompt).toContain("Cowgirl: western with feminine styling");
    expect(prompt).toContain("Mid-Century Modern: home and objects");
  });

  it("says to judge by the cues and to find three honest ones (seller, 28 Oct 2026)", () => {
    expect(prompt).toContain("Judge by the cues");
    expect(prompt).toContain("Return THREE whenever three honestly fit");
    expect(prompt).toContain("Fewer than three only when no more honestly fit");
    // Her correction: Y2K is low-rise.
    expect(prompt).toContain("Y2K is LOW-rise — never for high-rise or high-waisted pieces");
  });

  it("renders one aesthetic per line", () => {
    const lines = aestheticsPromptBlock().split("\n");
    expect(lines).toHaveLength(AESTHETICS.length);
    expect(lines[0].startsWith("- ")).toBe(true);
  });
});
