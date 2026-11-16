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
  it("takes out what does not belong, keeps every section, and says it is over", () => {
    // The limit is 1000 since 15 Nov 2026 (it was 800); since 16 Nov 2026 no
    // section is left out — the seller shortens it herself.
    expect(DESCRIPTION_LIMIT).toBe(1000);
    expect(NECKLACE.length).toBe(1381);
    const r = formatDescription(NECKLACE);
    expect(r.over).toBe(true);
    expect(r.dropped).toEqual([]);
    expect(r.text.startsWith("Gold Brown Twisted Cord")).toBe(true);
    expect(labels(r.text)).toEqual(["Brand", "Condition", "Color", "Details"]);
    expect(r.text).not.toMatch(/Keywords|Occasion|\nType:|\nDesign:|\nClosure:|\nThe Pendant:/);
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
    // The measurements right after Condition, without the old heading (12 Nov 2026).
    // The seller's order of 16 Nov 2026: Hallmarks before the rest; no Occasion.
    expect(labels(r.text)).toEqual([
      "Brand",
      "Condition",
      "Length",
      "Size",
      "Color",
      "Hallmarks",
      "Notes",
    ]);
    expect(r.text).toContain("Condition: Excellent.\n\nLength: 18 in\nWeight: 5 g\n\nSize: M Medium");
    expect(r.dropped).toEqual([]);
  });

  it("writes each measurement on its own line, no heading, no bullets (12 Nov 2026)", () => {
    const r = formatDescription(
      "T\n\nActual Measurements:\nLength: 18 in\n- Pendant: 2 x 1.5 in\n* Weight: 12 g",
    );
    expect(r.text).toBe("T\n\nLength: 18 in\nPendant: 2 x 1.5 in\nWeight: 12 g");
  });

  it("an old list written as its own paragraph becomes plain lines", () => {
    const r = formatDescription(
      "T\n\nColor: Red.\n\nActual Measurements:\n\n• Length: 18 in\n• Weight: 12 g\n\nBrand: Coach",
    );
    expect(r.text).toBe("T\n\nBrand: Coach\n\nLength: 18 in\nWeight: 12 g\n\nColor: Red.");
  });

  it("puts the measurement lines together right after Condition, before Size", () => {
    const r = formatDescription(
      "T\n\nBrand: Adajio\n\nSize: OS\n\nCondition: Pre-owned, excellent.\n\nLength: Approximately 1.5 in (3.8 cm)\n\nPendant: Approximately 2 W x 2.75 H in (5.1 W x 7 H cm)\n\nColor: Copper.",
    );
    expect(r.text).toBe(
      "T\n\nBrand: Adajio\n\nCondition: Pre-owned, excellent.\n\nLength: Approximately 1.5 in (3.8 cm)\nPendant: Approximately 2 W x 2.75 H in (5.1 W x 7 H cm)\n\nSize: OS\n\nColor: Copper.",
    );
  });

  it("takes hashtags out of the description", () => {
    const r = formatDescription("T\n\nBrand: Coach\n#coach #leather #bag\n\n#vintage");
    expect(r.text).toBe("T\n\nBrand: Coach");
  });

  it("never leaves out the title, Brand, Condition, Size or the measurements", () => {
    const long = "x".repeat(1100);
    const r = formatDescription(
      `T\n\nBrand: B\n\nCondition: ${long}\n\nSize: M\n\nActual Measurements:\n• Length: 1 in\n\nMaterial: Silk\n\nHallmarks: 925\n\nDesign: Pretty.`,
    );
    expect(r.over).toBe(true);
    // Nothing is left out any more (16 Nov 2026); Design is Details.
    expect(r.dropped).toEqual([]);
    expect(labels(r.text)).toEqual([
      "Brand",
      "Condition",
      "Length",
      "Size",
      "Material",
      "Hallmarks",
      "Details",
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
