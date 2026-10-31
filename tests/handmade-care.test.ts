import { expect, it } from "vitest";
import { applyDefaultHandmade } from "@/lib/listing-defaults";
import { photoFactProblem } from "@/lib/photo-facts";
import { describeFill, withoutSettledRefusals, type FillReport } from "@/lib/ebay/aspectFill";

// The seller's rules of 31 Oct 2026: Handmade is No unless her note says
// handmade; Garment Care is one of eBay's three words, read off the care label.
const handmade = { name: "Handmade", mode: "SELECTION_ONLY" as const, values: ["Yes", "No"] };
const care = {
  name: "Garment Care",
  mode: "FREE_TEXT" as const,
  values: ["Dry Clean Only", "Hand Wash Only", "Machine Washable"],
};
const fact = (name: string, value: string, quote: string, basis = "label") => ({
  name,
  value,
  basis,
  quote,
  photoIndices: [1],
});

it("Handmade defaults to No once the photo pass has had its turn", () => {
  const aspects: Record<string, string[]> = {};
  expect(applyDefaultHandmade(aspects, [handmade])).toBe(true);
  expect(aspects.Handmade).toEqual(["No"]);
});
it("a Handmade answer already there — Yes from her note — is never replaced", () => {
  const aspects: Record<string, string[]> = { Handmade: ["Yes"] };
  expect(applyDefaultHandmade(aspects, [handmade])).toBe(false);
  expect(aspects.Handmade).toEqual(["Yes"]);
  expect(applyDefaultHandmade({}, [])).toBe(false);
});
it("'handmade' on the seller's note is Handmade Yes", () => {
  expect(photoFactProblem(fact("Handmade", "Yes", "handmade"), 3, handmade)).toBeNull();
  expect(photoFactProblem(fact("Handmade", "Yes", "Hand-made in Peru"), 3, handmade)).toBeNull();
  expect(photoFactProblem(fact("Handmade", "Yes", "made by hand"), 3, handmade)).toBeNull();
});
it("Handmade Yes is still refused without the word, or with it negated, or from a look", () => {
  expect(photoFactProblem(fact("Handmade", "Yes", "Made in China"), 3, handmade)).not.toBeNull();
  expect(photoFactProblem(fact("Handmade", "Yes", "not handmade"), 3, handmade)).not.toBeNull();
  expect(photoFactProblem(fact("Handmade", "Yes", "", "visible_feature"), 3, handmade)).not.toBeNull();
});
it("Garment Care takes eBay's word for the instruction on the care label", () => {
  expect(photoFactProblem(fact("Garment Care", "Hand Wash Only", "HAND WASH COLD, LAY FLAT TO DRY"), 3, care)).toBeNull();
  expect(photoFactProblem(fact("Garment Care", "Machine Washable", "Machine wash cold, tumble dry low"), 3, care)).toBeNull();
  expect(photoFactProblem(fact("Garment Care", "Dry Clean Only", "DRY CLEAN ONLY"), 3, care)).toBeNull();
});
it("Garment Care is refused when the label says something else, or says not to, or from a look", () => {
  expect(photoFactProblem(fact("Garment Care", "Hand Wash Only", "Machine wash cold"), 3, care)).not.toBeNull();
  expect(photoFactProblem(fact("Garment Care", "Dry Clean Only", "Machine wash cold. Do not dry clean"), 3, care)).not.toBeNull();
  expect(photoFactProblem(fact("Garment Care", "Hand Wash Only", "", "visible_feature"), 3, care)).not.toBeNull();
});
it("a refusal the seller's default settled anyway is not reported as refused", () => {
  const r: FillReport = {
    ran: true,
    photos: 9,
    offered: 20,
    returned: 3,
    refused: 2,
    refusedWords: [
      { aspect: "Handmade", value: "No", why: "needs a label or your note, not just a look" },
      { aspect: "Vintage", value: "No", why: "needs a label or your note, not just a look" },
    ],
    added: 1,
    changed: ["Style"],
    note: "",
  };
  const line = describeFill(withoutSettledRefusals(r, { Handmade: ["No"], Style: ["Casual"] }));
  expect(line).toBe(
    'ran (9 photos), filled 1: Style (1 refused). Refused: Vintage "No" — needs a label or your note, not just a look.',
  );
});
