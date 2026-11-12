import { describe, expect, it } from "vitest";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import { AI_LISTING_SCHEMA } from "@/lib/ai-schema";
import { scrubContactInfo } from "@/lib/contact-info";

describe("the model is told the description rules of 27 Oct 2026", () => {
  const prompt = buildProfiledAnalysisPrompt("auto");

  it("asks for at most 800 characters, in the agreed order, without Keywords", () => {
    expect(prompt).toContain("AT MOST 800 CHARACTERS");
    expect(prompt).not.toContain("1000 words");
    const order = [
      "1. The exact title",
      "2. The seller's opening sentence",
      "3. Brand",
      "4. Condition",
      "5. The measurements, right after Condition",
      "6. Size",
    ];
    const from = prompt.indexOf("SECTION ORDER");
    const at = order.map((o) => prompt.indexOf(o, from));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(prompt).toContain("no heading and no bullets");
    expect(prompt).toContain("NEVER write a Keywords section");
    expect(prompt).not.toMatch(/\nKeywords: /);
  });

  it("shows an example that itself fits", () => {
    const m = prompt.match(/Example \((\d+) characters\):\n\n([\s\S]*?)\n\nUse other clear/);
    expect(m).not.toBeNull();
    expect(m![2].length).toBe(Number(m![1]));
    expect(m![2].length).toBeLessThanOrEqual(800);
    // The seller's approved example (28 Oct 2026): her voice, then facts.
    expect(m![2]).toContain("can be given some extra pizzazz");
    expect(m![2]).toContain('Length: Approximately 35-40" (88.9-101.6 cm), adjustable');
    expect(m![2]).not.toMatch(/made in/i);
  });

  it("asks for hashtags and 13 Etsy tags, outside the description", () => {
    expect(prompt).toContain('"hashtags": exactly 5 hashtags for Depop, Mercari and Poshmark, in THIS ORDER');
    expect(prompt).toContain("1st and 2nd — WHAT THE ITEM IS");
    expect(prompt).toContain("3rd, 4th and 5th — AESTHETICS");
    expect(prompt).toContain("never #goldnecklace");
    expect(prompt).toContain('"etsy_tags": exactly 13 Etsy tags');
    expect(prompt).toContain("NEVER part of the description");
    const keys = Object.keys(AI_LISTING_SCHEMA.properties);
    expect(keys.indexOf("hashtags")).toBeGreaterThan(keys.indexOf("description"));
    expect(AI_LISTING_SCHEMA.required).toEqual(expect.arrayContaining(["hashtags", "etsy_tags"]));
  });

  it("keeps contact details out of the tags too", () => {
    const l = {
      title: "T",
      description: "T",
      hashtags: ["#coliebloom", "www.coliebloom.com"],
      etsy_tags: ["resin art", "coliebloom.com"],
    };
    expect(scrubContactInfo(l)).toEqual(["www.coliebloom.com", "coliebloom.com"]);
    expect(l.hashtags).toEqual(["#coliebloom"]);
    expect(l.etsy_tags).toEqual(["resin art"]);
  });
});

describe("the seller's voice (28 Oct 2026)", () => {
  const prompt = buildProfiledAnalysisPrompt("auto");

  it("takes the turn of phrase from her phrases, never their facts", () => {
    expect(prompt).toContain("kept in HER WORDS");
    expect(prompt).toContain("Change ONLY what must change to be true of this item");
    expect(prompt).toContain("paints the liveliest TRUE picture");
    expect(prompt).toContain("Never carry over a fact that is not true of this item");
    expect(prompt).toContain('A plain ring never becomes "Tiffany"');
    expect(prompt).toContain('"looks a lot more expensive than it cost"');
    expect(prompt).toContain("never for a stone recognised by its look");
    expect(prompt).toContain("aim for 700–790");
    expect(prompt).toContain("Do NOT pile up descriptive adjectives");
  });

  it("never writes where the item was made in the description", () => {
    expect(prompt).toContain('Never write where the item was made ("Made in Vietnam"');
    expect(prompt).toContain("Country of manufacture goes to the item specifics only");
  });

  it("asks which phrase was used, before the description", () => {
    const keys = Object.keys(AI_LISTING_SCHEMA.properties);
    expect(keys.indexOf("style_phrase_id")).toBe(keys.indexOf("description") - 1);
    expect(AI_LISTING_SCHEMA.required).toContain("style_phrase_id");
  });
});

describe("a piece made of more than one fabric says so (the seller, 31 Oct 2026)", () => {
  it("names each part in the description, hedged when judged by eye", async () => {
    const { ANALYSIS_PROMPT } = await import("@/lib/prompts");
    const p = String(ANALYSIS_PROMPT);
    expect(p).toContain("MORE THAN ONE FABRIC OR MATERIAL");
    expect(p).toContain("Back: sheer chiffon-like fabric");
    expect(p).toContain("Fiber content (viscose, cotton, polyester percentages) still only from a label");
    const { PROFILE_PROMPT_ADDONS } = await import("@/lib/prompts");
    expect(Object.values(PROFILE_PROMPT_ADDONS).join("\n")).toContain(
      "whether it is made of more than one fabric",
    );
  });
});

describe("a sheer or different part goes in the title (the seller, 31 Oct 2026)", () => {
  it("by what it looks like, never a fabric the label does not give", async () => {
    const { ANALYSIS_PROMPT } = await import("@/lib/prompts");
    const p = String(ANALYSIS_PROMPT);
    expect(p).toContain('"Sheer Back", "Sheer Sleeves", "Lace Panel", "Mesh Inset"');
    expect(p).toContain('"Chiffon Back" only when a label or the seller\'s note says chiffon');
    expect(p).toContain('a "Sheer Back" kind of note is the last of them to go');
  });
});

describe("condition: the grade, detailed notes beside the price, a short line in the description (31 Oct 2026)", () => {
  it("tells the AI the seller's three rules", async () => {
    const { ANALYSIS_PROMPT } = await import("@/lib/prompts");
    const p = String(ANALYSIS_PROMPT);
    expect(p).toContain("start from EXCELLENT");
    expect(p).toContain("what shape is THIS piece in — what is good and what is not. Nothing else.");
    expect(p).toContain("• Faded, distressed print is part of the design");
    expect(p).toContain('"Condition: Pre-owned, excellent, nothing is wrong with it."');
    expect(p).toContain('ONLY when the seller\'s note says so ("zip works great", "clips ok")');
    expect(p).toContain("Condition: Pre-owned, excellent, worn only a couple of times.");
  });
});

describe("condition notes: only condition, one thing per line, a human voice (6 Nov 2026)", () => {
  it("tells the AI the seller's rules from the Dior clip earrings", async () => {
    const { ANALYSIS_PROMPT } = await import("@/lib/prompts");
    const p = String(ANALYSIS_PROMPT);
    // one line: the grade, a colon, the points (12 Nov 2026); 3 / 5 points (11 Nov)
    expect(p).toContain("ONE line in all (the seller, 12 Nov 2026).");
    expect(p).toContain('never "looks great"');
    expect(p).toContain("Excellent, Very good and Good — 1 to 3; Fair and lower — up to 5");
    // one thing per point, no repeats
    expect(p).toContain("ONE thing per point, and no two points say the same thing.");
    expect(p).toContain('no other point says "No missing stones"');
    // from big to small
    expect(p).toContain("From big to small");
    // never design, hallmarks, brand, size
    expect(p).toContain('"Clear marquise and round crystals set in a leaf cluster"');
    expect(p).toContain('"Chr.Dior © stamped on both clip backs"');
    // small flaw named, big flaw placed and sized; vintage wear
    expect(p).toContain('"Minor signs of wear consistent with age"');
    expect(p).toContain("A big one, what it is, where, and how big");
    // design or damage
    expect(p).toContain("When the photos cannot tell, say what you see and where, plainly, without calling it either.");
    // voice
    expect(p).toContain('Never ad copy or slogans ("Dior is Dior"');
  });
});
