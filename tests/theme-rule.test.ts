import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Theme is always filled with the closest honest style (1 Nov 2026).
it("the photo pass is told Theme is always filled, never with a motif that is not there", () => {
  const src = readFileSync("lib/ebay/aspectFill.ts", "utf8");
  expect(src).toContain("Theme is ALWAYS filled");
  expect(src).toContain("classic tailored pieces (dress trousers, blazers, button shirts, pleated skirts) are Preppy");
  expect(src).toContain("no Flower on a plain dress");
});
