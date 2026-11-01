import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Theme is always filled with the closest honest style (1 Nov 2026).
it("the photo pass is told Theme is always filled, never with a motif that is not there", () => {
  const src = readFileSync("lib/ebay/aspectFill.ts", "utf8");
  expect(src).toContain("Theme is ALWAYS filled");
  expect(src).toContain("classic tailored pieces (dress trousers, blazers, button shirts, pleated skirts) are Preppy");
  expect(src).toContain("no Flower on a plain dress");
});

import { buildProfiledAnalysisPrompt } from "@/lib/prompts";

// Where a detail is comes only from the photo that shows it (1 Nov 2026: the
// Prada trousers' tape was on the back panels and went out as "Side Trim").
it("the analysis is told to place every detail only by the photo that shows it", () => {
  const prompt = buildProfiledAnalysisPrompt("clothing");
  expect(prompt).toContain("WHERE A DETAIL IS");
  expect(prompt).toContain('A detail seen only on a back view is on the BACK');
  expect(prompt.indexOf("WHERE A DETAIL IS")).toBeLessThan(prompt.indexOf("TITLE\n"));
});
