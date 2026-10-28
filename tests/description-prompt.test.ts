import { describe, expect, it } from "vitest";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import { AI_LISTING_SCHEMA } from "@/lib/ai-schema";
import { scrubContactInfo } from "@/lib/contact-info";

describe("the model is told the description rules of 27 Oct 2026", () => {
  const prompt = buildProfiledAnalysisPrompt("auto");

  it("asks for at most 800 characters, in the agreed order, without Keywords", () => {
    expect(prompt).toContain("AT MOST 800 CHARACTERS");
    expect(prompt).not.toContain("1000 words");
    const order = ["1. The exact title", "2. Brand", "3. Condition", "4. Size", "5. Actual Measurements"];
    const from = prompt.indexOf("SECTION ORDER");
    const at = order.map((o) => prompt.indexOf(o, from));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(prompt).toContain('starting with "• "');
    expect(prompt).toContain("NEVER write a Keywords section");
    expect(prompt).not.toMatch(/\nKeywords: /);
  });

  it("shows an example that itself fits", () => {
    const m = prompt.match(/Example \((\d+) characters\):\n\n([\s\S]*?)\n\nUse other clear/);
    expect(m).not.toBeNull();
    expect(m![2].length).toBe(Number(m![1]));
    expect(m![2].length).toBeLessThanOrEqual(800);
    expect(m![2]).toContain("• Length: 1.25 in");
    // The example no longer calls a signed piece Unbranded.
    expect(m![2]).toContain("Brand: Judith Ripka");
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
