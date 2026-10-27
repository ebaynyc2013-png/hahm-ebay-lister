import { describe, expect, it } from "vitest";
import { DESCRIPTION_LIMIT, formatDescription } from "@/lib/description-format";

// The seller's Premier Designs necklace card, as the working version wrote it
// on 27 Oct 2026: 1381 characters, Color after Closure, a Keywords line.
const NECKLACE = `Gold Brown Twisted Cord Hammered Open Diamond Pendant Necklace Crown Charm Boho

Brand: Unbranded

Condition: Very good pre-owned condition. The gold tone pendant is bright and polished with a faint swirl pattern and a few light handling marks on the flat front. The brown twisted cord is clean and intact, and the clasp and extender work smoothly and securely.

Type: Cord pendant necklace with a single large gold tone pendant.

The Pendant: A bold hammered gold tone diamond shape with a large off-center open cutout near the top. The surface has a soft reflective polish and a gently textured, slightly wavy finish that catches the light. It hangs from a smooth curved gold tone bail that slides over the cord.

Design: The pendant threads onto a dark brown twisted cord that mimics a silky rope. The look is organic and modern, pairing the warm metallic pendant against the deep brown cord for an easy statement piece.

Closure: Gold tone lobster style clasp with an adjustable extender chain so you can shorten or lengthen the fit. A small decorative crown charm dangles at the end of the extender.

Color: Gold tone pendant and hardware with a dark brown cord.

Occasion: Great everyday or dressed up piece, easy to layer and works with casual or boho outfits.

Keywords: gold cord pendant necklace, hammered diamond pendant, crown charm, adjustable boho statement necklace.`;

const labels = (text: string) =>
  text
    .split("\n\n")
    .slice(1)
    .map((b) => b.split(":")[0]);

describe("the description fits a phone screen, in the seller's order", () => {
  it("brings the necklace within 800 characters, title, brand and condition first", () => {
    expect(NECKLACE.length).toBe(1381);
    const r = formatDescription(NECKLACE);
    expect(r.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(r.over).toBe(false);
    expect(r.text.startsWith("Gold Brown Twisted Cord")).toBe(true);
    expect(labels(r.text).slice(0, 2)).toEqual(["Brand", "Condition"]);
    expect(r.text).not.toContain("Keywords");
    // Least needed first: Occasion, then the design paragraphs.
    expect(r.dropped[0]).toBe("Occasion");
    expect(r.text).toContain("Condition: Very good pre-owned condition.");
  });

  it("puts the sections in the agreed order and leaves a short one whole", () => {
    const r = formatDescription(
      [
        "Title",
        "Occasion: Evening.",
        "Hallmarks: 925.",
        "Color: Black.",
        "Actual Measurements:\nLength: 18 in\nWeight: 5 g",
        "Size: M Medium",
        "Notes: Hand finished.",
        "Condition: Excellent.",
        "Brand: Coach",
        "Keywords: black, coach",
      ].join("\n\n"),
    );
    expect(labels(r.text)).toEqual([
      "Brand",
      "Condition",
      "Size",
      "Actual Measurements",
      "Color",
      "Occasion",
      "Notes",
      "Hallmarks",
    ]);
    expect(r.dropped).toEqual([]);
  });

  it("writes each measurement on its own line, marked for eBay's list", () => {
    const r = formatDescription(
      "T\n\nActual Measurements:\nLength: 18 in\n- Pendant: 2 x 1.5 in\n* Weight: 12 g",
    );
    expect(r.text).toBe(
      "T\n\nActual Measurements:\n• Length: 18 in\n• Pendant: 2 x 1.5 in\n• Weight: 12 g",
    );
  });

  it("keeps a list written as its own paragraph with its label", () => {
    const r = formatDescription(
      "T\n\nColor: Red.\n\nActual Measurements:\n\n• Length: 18 in\n• Weight: 12 g\n\nBrand: Coach",
    );
    expect(r.text).toBe(
      "T\n\nBrand: Coach\n\nActual Measurements:\n• Length: 18 in\n• Weight: 12 g\n\nColor: Red.",
    );
  });

  it("takes hashtags out of the description", () => {
    const r = formatDescription("T\n\nBrand: Coach\n#coach #leather #bag\n\n#vintage");
    expect(r.text).toBe("T\n\nBrand: Coach");
  });

  it("never leaves out the title, Brand, Condition, Size or the measurements", () => {
    const long = "x".repeat(900);
    const r = formatDescription(
      `T\n\nBrand: B\n\nCondition: ${long}\n\nSize: M\n\nActual Measurements:\n• Length: 1 in\n\nMaterial: Silk\n\nHallmarks: 925\n\nDesign: Pretty.`,
    );
    expect(r.over).toBe(true);
    expect(r.dropped).toEqual(["Design"]);
    expect(labels(r.text)).toEqual([
      "Brand",
      "Condition",
      "Size",
      "Actual Measurements",
      "Material",
      "Hallmarks",
    ]);
  });

  it("changes nothing in a short description already in order", () => {
    const text = "T\n\nBrand: Coach\n\nCondition: Excellent.";
    expect(formatDescription(text)).toEqual({
      text,
      dropped: [],
      length: text.length,
      over: false,
    });
  });
});
