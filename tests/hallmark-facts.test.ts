import { describe, expect, it } from "vitest";
import { hallmarkInQuote, photoFactProblem } from "@/lib/photo-facts";

// 6 Nov 2026: a cross stamped "STERLING" had Metal "Sterling Silver" and
// Metal Purity "925" refused as "not what the label says".
const fact = (name: string, value: string, quote: string) => ({
  name,
  value,
  basis: "label",
  quote,
  photoIndices: [2],
});

describe("a metal stamp is read the way the trade reads it", () => {
  it("STERLING is Sterling Silver, 925", () => {
    expect(photoFactProblem(fact("Metal", "Sterling Silver", "STERLING"), 5)).toBeNull();
    expect(photoFactProblem(fact("Metal Purity", "925", "STERLING"), 5)).toBeNull();
    expect(photoFactProblem(fact("Base Metal", "Sterling Silver", "STERLING"), 5)).toBeNull();
  });

  it("925 and .925 are sterling too", () => {
    expect(hallmarkInQuote("Metal", "Sterling Silver", "925 ITALY")).toBe(true);
    expect(hallmarkInQuote("Metal", "Sterling Silver", ".925")).toBe(true);
    expect(hallmarkInQuote("Metal Purity", "925", "STER")).toBe(true);
  });

  it("karat stamps and their fineness", () => {
    expect(hallmarkInQuote("Metal Purity", "14k", "585")).toBe(true);
    expect(hallmarkInQuote("Metal Purity", "14k", "14KT")).toBe(true);
    expect(hallmarkInQuote("Metal Purity", "18k", "750")).toBe(true);
    expect(hallmarkInQuote("Metal Purity", "10k", "10K")).toBe(true);
    expect(hallmarkInQuote("Metal", "Yellow Gold", "14K")).toBe(true);
    expect(hallmarkInQuote("Metal Purity", "18k", "14K")).toBe(false);
  });

  it("plated or filled marks never stand for solid gold", () => {
    expect(hallmarkInQuote("Metal", "Yellow Gold", "1/20 14K GF")).toBe(false);
    expect(hallmarkInQuote("Metal Purity", "14k", "14K GP")).toBe(false);
    expect(hallmarkInQuote("Metal", "Yellow Gold", "18K HGE")).toBe(false);
    // gold over sterling: the base metal and purity are still sterling
    expect(hallmarkInQuote("Base Metal", "Sterling Silver", "925 VERMEIL")).toBe(true);
    expect(hallmarkInQuote("Metal Purity", "925", "925 VERMEIL")).toBe(true);
    expect(hallmarkInQuote("Metal", "Sterling Silver", "925 VERMEIL")).toBe(false);
  });

  it("no stamp, no metal; a year is not 925; other fields untouched", () => {
    expect(photoFactProblem(fact("Metal", "Sterling Silver", "MADE IN USA"), 5)).toBe(
      "not what the label says",
    );
    expect(hallmarkInQuote("Metal Purity", "925", "EST. 1925")).toBe(false);
    expect(hallmarkInQuote("Brand", "Sterling Silver", "STERLING")).toBe(false);
    expect(hallmarkInQuote("Signed", "Yes", "STERLING")).toBe(false);
  });
});

describe("Occasion is filled for jewellery too", () => {
  it("the fill pass no longer leaves Occasion empty for anything but clothing", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/ebay/aspectFill.ts", "utf8"),
    );
    expect(src).not.toContain("Leave Occasion empty only when the item is not clothing");
    expect(src).toContain('A sterling cross pendant: "Christening | Confirmation/Communion | Christmas | Birthday"');
  });
});
