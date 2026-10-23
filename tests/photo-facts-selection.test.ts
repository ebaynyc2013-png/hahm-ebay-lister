import { describe, expect, it } from "vitest";
import { acceptedPhotoFact, type AspectShape } from "@/lib/photo-facts";

const menu = (name: string, values: string[]): AspectShape => ({
  name,
  mode: "SELECTION_ONLY",
  values,
});
const freeText = (name: string): AspectShape => ({
  name,
  mode: "FREE_TEXT",
  values: [],
});

const seen = (name: string, value: string) => ({
  name,
  value,
  photoIndices: [1],
  basis: "visible_feature" as const,
  quote: "",
});

describe("facts seen in a photo, against eBay's own menus", () => {
  it("accepts a choice from a menu eBay wrote itself", () => {
    // The real case: Dress Length is REQUIRED and was going out empty.
    expect(
      acceptedPhotoFact(
        seen("Dress Length", "Midi"),
        1,
        menu("Dress Length", [
          "Short",
          "Knee Length",
          "Midi",
          "Long",
          "Hi-Low",
          "Asymmetric",
        ]),
      ),
    ).toBe(true);

    for (const [name, value] of [
      ["Occasion", "Formal"],
      ["Theme", "Floral"],
      ["Season", "Summer"],
      ["Sleeve Type", "Cap Sleeve"],
      ["Silhouette", "A-Line"],
      ["Fit", "Regular"],
      ["Chain Type", "Cable"],
      ["Pendant Shape", "Round"],
    ] as const)
      expect(
        acceptedPhotoFact(seen(name, value), 1, menu(name, [value])),
      ).toBe(true);
  });

  it("still refuses what a photograph cannot settle", () => {
    // Substance: cotton against linen, silver against plate.
    for (const name of [
      "Material",
      "Fabric Type",
      "Metal",
      "Metal Purity",
      "Base Metal",
      "Main Stone",
      "Secondary Stone",
    ])
      expect(
        acceptedPhotoFact(seen(name, "Silk"), 1, menu(name, ["Silk"])),
      ).toBe(false);

    // Age and provenance.
    for (const name of ["Vintage", "Antique", "Era", "Country of Origin"])
      expect(acceptedPhotoFact(seen(name, "Yes"), 1, menu(name, ["Yes"]))).toBe(
        false,
      );

    // Claims about how it was made or sold.
    for (const name of ["Handmade", "Signed", "Customized", "Wholesale"])
      expect(acceptedPhotoFact(seen(name, "Yes"), 1, menu(name, ["Yes"]))).toBe(
        false,
      );

    // Lab grading comes off a certificate.
    for (const name of ["Cut Grade", "Gemstone Clarity Grade"])
      expect(acceptedPhotoFact(seen(name, "Ideal"), 1, menu(name, ["Ideal"]))).toBe(
        false,
      );
  });

  it("lets a colour or shape through even when a stone is named", () => {
    // "Main Stone Color" names a stone but asks for a colour, and colour is
    // what a photograph is best at.
    expect(
      acceptedPhotoFact(
        seen("Main Stone Color", "Blue"),
        1,
        menu("Main Stone Color", ["Blue"]),
      ),
    ).toBe(true);
    expect(
      acceptedPhotoFact(
        seen("Main Stone Shape", "Oval"),
        1,
        menu("Main Stone Shape", ["Oval"]),
      ),
    ).toBe(true);
  });

  it("refuses a free-text aspect, which is a measurement or a phrase", () => {
    // Necklace Length wants inches; no photo settles that without a ruler.
    expect(
      acceptedPhotoFact(
        seen("Necklace Length", "18 in"),
        1,
        freeText("Necklace Length"),
      ),
    ).toBe(false);
    expect(
      acceptedPhotoFact(seen("Heel Height", "4 in"), 1, freeText("Heel Height")),
    ).toBe(false);
    // A menu with nothing in it is no menu.
    expect(
      acceptedPhotoFact(seen("Occasion", "Formal"), 1, menu("Occasion", [])),
    ).toBe(false);
  });

  it("keeps the old behaviour when no aspect is known", () => {
    // The first analysis runs before a category is chosen.
    expect(acceptedPhotoFact(seen("Neckline", "V-Neck"), 1)).toBe(true);
    expect(acceptedPhotoFact(seen("Dress Length", "Midi"), 1)).toBe(false);
  });
});
