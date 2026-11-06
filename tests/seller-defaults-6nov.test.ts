import { describe, expect, it } from "vitest";
import {
  applyDefaultAntique,
  applyRhinestones,
  applySignedFromMarks,
} from "@/lib/listing-defaults";
import { photoFactProblem } from "@/lib/photo-facts";

// The seller's rules of 6 Nov 2026, after the Dior clip earrings and the
// sterling cross: Antique No; Signed Yes for any mark on the piece;
// rhinestones (by the word) as Main Stone Crystal and Material Rhinestone;
// Occasion for every item.
const yesNo = ["Yes", "No"];
const label = (name: string, value: string, quote: string) => ({
  name,
  value,
  basis: "label",
  quote,
  photoIndices: [1],
});

describe("Antique", () => {
  it("is No when nothing said otherwise", () => {
    const a: Record<string, string[]> = {};
    expect(applyDefaultAntique(a, [{ name: "Antique", values: yesNo }])).toBe(true);
    expect(a.Antique).toEqual(["No"]);
  });
  it("keeps a Yes from her note", () => {
    const a: Record<string, string[]> = { Antique: ["Yes"] };
    expect(applyDefaultAntique(a, [{ name: "Antique", values: yesNo }])).toBe(false);
    expect(a.Antique).toEqual(["Yes"]);
  });
  it("antique on her note is accepted; an antique finish is not an age", () => {
    expect(photoFactProblem(label("Antique", "Yes", "antique brooch 1890s"), 3)).toBeNull();
    expect(photoFactProblem(label("Antique", "Yes", "antique gold tone"), 3)).not.toBeNull();
    expect(photoFactProblem(label("Antique", "Yes", "antiqued silver finish"), 3)).not.toBeNull();
  });
});

describe("Signed", () => {
  const meta = [{ name: "Signed", values: yesNo }];
  it("any mark on the piece is Yes — even only STERLING", () => {
    const a: Record<string, string[]> = {};
    applySignedFromMarks(a, meta, {
      maker_marks: ['Photo 2: stamped "STERLING" on the top arm of the cross'],
      brand_source: "none",
    });
    expect(a.Signed).toEqual(["Yes"]);
  });
  it("a brand read off a label is Yes", () => {
    const a: Record<string, string[]> = {};
    applySignedFromMarks(a, meta, { maker_marks: [], brand_source: "label" });
    expect(a.Signed).toEqual(["Yes"]);
  });
  it("nothing written or stamped is No", () => {
    const a: Record<string, string[]> = {};
    applySignedFromMarks(a, meta, { maker_marks: [], brand_source: "none" });
    expect(a.Signed).toEqual(["No"]);
  });
  it("never changes an answer already given", () => {
    const a: Record<string, string[]> = { Signed: ["No"] };
    applySignedFromMarks(a, meta, { maker_marks: ["Photo 1: Chr.Dior ©"], brand_source: "label" });
    expect(a.Signed).toEqual(["No"]);
  });
  it("the photo pass's Signed Yes from a stamp is no longer refused", () => {
    expect(photoFactProblem(label("Signed", "Yes", "STERLING"), 5)).toBeNull();
    expect(photoFactProblem(label("Signed", "Yes", "Chr.Dior ©"), 5)).toBeNull();
    expect(photoFactProblem(label("Signed", "Yes", "unsigned"), 5)).not.toBeNull();
  });
});

describe("Rhinestones — by the word in the title or description", () => {
  const meta = [
    { name: "Main Stone", values: ["Crystal", "Pearl", "Rhinestone", "No Stone"], cardinality: "SINGLE" },
    { name: "Material", values: ["Metal", "Rhinestone", "Glass"], cardinality: "MULTI" },
  ];
  const dior = { title: "Vintage Chr Dior Rhinestone Leaf Clip Earrings Gold Tone", description: "" };

  it("Main Stone Crystal, Material Rhinestone added", () => {
    const a: Record<string, string[]> = { "Main Stone": ["Rhinestone"], Material: ["Metal"] };
    expect(applyRhinestones(a, meta, dior)).toBe(true);
    expect(a["Main Stone"]).toEqual(["Crystal"]);
    expect(a.Material).toEqual(["Metal", "Rhinestone"]);
  });
  it("fills empty fields and replaces No Stone", () => {
    const a: Record<string, string[]> = { "Main Stone": ["No Stone"] };
    applyRhinestones(a, meta, dior);
    expect(a["Main Stone"]).toEqual(["Crystal"]);
    expect(a.Material).toEqual(["Rhinestone"]);
  });
  it("never replaces another real stone", () => {
    const a: Record<string, string[]> = { "Main Stone": ["Pearl"] };
    applyRhinestones(a, meta, { title: "Pearl Rhinestone Drop Earrings", description: "" });
    expect(a["Main Stone"]).toEqual(["Pearl"]);
  });
  it("a single-value Material becomes Rhinestone", () => {
    const one = [meta[0], { ...meta[1], cardinality: "SINGLE" }];
    const a: Record<string, string[]> = { Material: ["Metal"] };
    applyRhinestones(a, one, dior);
    expect(a.Material).toEqual(["Rhinestone"]);
  });
  it("does nothing without the word", () => {
    const a: Record<string, string[]> = {};
    expect(applyRhinestones(a, meta, { title: "Gold Tone Leaf Clip Earrings", description: "" })).toBe(false);
    expect(a).toEqual({});
  });
});

describe("Occasion for every item", () => {
  it("the fill prompt never leaves it empty when eBay offers it", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("lib/ebay/aspectFill.ts", "utf8");
    expect(src).toContain("NEVER leave Occasion empty when eBay offers it");
    expect(src).toContain("Shoes, bags and accessories follow the garments");
    expect(src).not.toContain("Leave Occasion empty only when");
  });
});

describe("jewellery clasps stay out of the title", () => {
  it("tells the AI the seller's rule, Toggle on a chunky chain the one exception", async () => {
    const { ANALYSIS_PROMPT } = await import("@/lib/prompts");
    const p = String(ANALYSIS_PROMPT);
    expect(p).toContain("never put a jewellery clasp in the title");
    expect(p).toContain('The one exception is "Toggle" on a chunky, heavy chain');
    expect(p).toContain("A toggle on an ordinary or fine chain stays out of the title too.");
  });
});
