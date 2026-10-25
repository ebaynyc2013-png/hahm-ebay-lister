import { describe, expect, it } from "vitest";
import { COLOR_SYNONYMS, snapToVocabulary } from "@/lib/ebay/aspects";
import { acceptedPhotoFact, type AspectShape } from "@/lib/photo-facts";

// eBay's real colour list for Women's Dresses (63861) — seventeen values.
const COLORS = [
  "Beige",
  "Black",
  "Blue",
  "Brown",
  "Clear",
  "Gold",
  "Gray",
  "Green",
  "Ivory",
  "Multicolor",
  "Orange",
  "Pink",
  "Purple",
  "Red",
  "Silver",
  "White",
  "Yellow",
];

describe("snapToVocabulary", () => {
  it("says the word eBay's buyers filter on", () => {
    // The real case: a dress recorded as "Light Blue" never appears under
    // Color: Blue, the only blue eBay offers.
    expect(snapToVocabulary("Light Blue", COLORS)).toBe("Blue");
    expect(snapToVocabulary("Dark Green", COLORS)).toBe("Green");
    expect(snapToVocabulary("Rose Gold", COLORS)).toBe("Gold");
    expect(snapToVocabulary("off-white", COLORS)).toBe("White");
  });

  it("leaves an exact value exactly as it is", () => {
    expect(snapToVocabulary("Blue", COLORS)).toBe("Blue");
    expect(snapToVocabulary("Multicolor", COLORS)).toBe("Multicolor");
  });

  it("keeps what eBay has no word for", () => {
    // Free text means free text — nothing is dropped.
    expect(snapToVocabulary("Blue Green", COLORS)).toBe("Blue Green");
    expect(snapToVocabulary("anything", [])).toBe("anything");
  });
});

describe("bare shades", () => {
  const snap = (v: string) => snapToVocabulary(v, COLORS, COLOR_SYNONYMS);

  it("sends a shade home when it has one obvious home", () => {
    // "Navy Blue" resolves by the word Blue; a bare "Navy" carries no eBay
    // colour word at all, and resellers write bare shades constantly.
    for (const [written, filed] of [
      ["Navy", "Blue"],
      ["Burgundy", "Red"],
      ["Emerald", "Green"],
      ["Charcoal", "Gray"],
      ["Cream", "Ivory"],
      ["Khaki", "Beige"],
      ["Lavender", "Purple"],
      ["Chocolate", "Brown"],
      ["navy", "Blue"],
    ] as const)
      expect(snap(written)).toBe(filed);
  });

  it("prefers eBay's own word when the shade carries one", () => {
    // Rose is Pink on its own, but "Rose Gold" is gold.
    expect(snap("Rose Gold")).toBe("Gold");
    expect(snap("Rose")).toBe("Pink");
    expect(snap("Navy Blue")).toBe("Blue");
  });

  it("files the in-between shades where the seller decided", () => {
    // These sit between two of eBay's colours and were held back until she
    // chose. Turquoise→Blue and Coral→Pink are her own examples.
    for (const [written, filed] of [
      ["Turquoise", "Blue"],
      ["Teal", "Blue"],
      ["Aqua", "Blue"],
      ["Coral", "Pink"],
      ["Fuchsia", "Pink"],
      ["Rust", "Orange"],
      ["Mustard", "Yellow"],
      ["Taupe", "Beige"],
      ["Plum", "Purple"],
    ] as const)
      expect(snap(written)).toBe(filed);
  });

  it("still leaves an undecided or contradictory shade alone", () => {
    // Magenta was not among her decisions.
    expect(snap("Magenta")).toBe("Magenta");
    // Two shades pointing different ways is no answer either.
    expect(snap("Navy Burgundy")).toBe("Navy Burgundy");
  });

  it("only files a colour the category actually offers", () => {
    // A category whose colour list omits Blue gets nothing from "Navy".
    expect(snapToVocabulary("Navy", ["Red", "Green"], COLOR_SYNONYMS)).toBe(
      "Navy",
    );
  });

  it("leaves other fields' shades alone", () => {
    // The synonyms are passed only for colour aspects.
    expect(snapToVocabulary("Navy", COLORS)).toBe("Navy");
  });
});

const field = (
  name: string,
  values: string[],
  mode: AspectShape["mode"] = "FREE_TEXT",
): AspectShape => ({ name, mode, values });

const seen = (name: string, value: string) => ({
  name,
  value,
  photoIndices: [1],
  basis: "visible_feature" as const,
  quote: "",
});

describe("choosing from a vocabulary eBay supplied", () => {
  it("fills the required Dress Length eBay calls free text", () => {
    // eBay's own form shows a menu; its API returns FREE_TEXT with the same
    // six values, and the required field went out empty on every dress.
    expect(
      acceptedPhotoFact(
        seen("Dress Length", "Midi"),
        1,
        field("Dress Length", [
          "Short",
          "Knee Length",
          "Midi",
          "Long",
          "Hi-Low",
          "Asymmetric",
        ]),
      ),
    ).toBe(true);

    for (const [name, value, values] of [
      ["Sleeve Type", "Puff Sleeve", ["Puff Sleeve", "Bell Sleeve"]],
      ["Fit", "Relaxed", ["Classic", "Fitted", "Relaxed"]],
      ["Silhouette", "Shift", ["A-Line", "Shift", "Wrap"]],
      ["Theme", "Floral", ["Floral", "Animals", "Christmas"]],
    ] as const)
      expect(
        acceptedPhotoFact(seen(name, value), 1, field(name, [...values])),
      ).toBe(true);
  });

  it("never guesses a brand or a size, however long the list", () => {
    // eBay offers 4,523 brands and 132 sizes for a dress. Those come off the
    // label or they do not come at all.
    expect(
      acceptedPhotoFact(
        seen("Brand", "DKNY"),
        1,
        field("Brand", ["DKNY", "Calvin Klein", "Unbranded"]),
      ),
    ).toBe(false);
    expect(
      acceptedPhotoFact(seen("Size", "L"), 1, field("Size", ["S", "M", "L"])),
    ).toBe(false);
    for (const name of ["Model", "MPN", "UPC", "Manufacturer"])
      expect(acceptedPhotoFact(seen(name, "X1"), 1, field(name, ["X1"]))).toBe(
        false,
      );
  });

  it("leaves Size Type alone, which is not a size", () => {
    // Matched as a whole name, so "size" does not swallow "Size Type".
    expect(
      acceptedPhotoFact(
        seen("Size Type", "Regular"),
        1,
        field("Size Type", ["Regular", "Plus", "Petites"], "SELECTION_ONLY"),
      ),
    ).toBe(true);
  });

  it("refuses a vocabulary made of measurements", () => {
    // "16 in", "18 in" is not a set of choices a photograph can make.
    expect(
      acceptedPhotoFact(
        seen("Necklace Length", "18 in"),
        1,
        field("Necklace Length", ["16 in", "18 in", "20 in", "24 in"]),
      ),
    ).toBe(false);
    expect(
      acceptedPhotoFact(
        seen("US Shoe Size", "7"),
        1,
        field("US Shoe Size", ["6", "6.5", "7", "7.5"]),
      ),
    ).toBe(false);
  });

  it("tells fibre content from weave, as eBay does", () => {
    // Material is fibre content off a care tag; Fabric Type is weave and
    // construction, which a photograph shows. A denim dress was filing
    // "Denim" under Material, where eBay offers no such value.
    expect(
      acceptedPhotoFact(
        seen("Fabric Type", "Denim"),
        1,
        field("Fabric Type", ["Denim", "Corduroy", "Lace", "Velvet"]),
      ),
    ).toBe(true);
    expect(
      acceptedPhotoFact(
        seen("Material", "Cotton"),
        1,
        field("Material", ["Cotton", "Linen", "Silk"]),
      ),
    ).toBe(false);
  });

  it("holds the old lines against substance, age and provenance", () => {
    for (const [name, value] of [
      ["Material", "Cotton"],
      ["Metal", "Sterling Silver"],
      ["Main Stone", "Onyx"],
      ["Vintage", "Yes"],
      ["Handmade", "Yes"],
      ["Country of Origin", "Italy"],
      ["Cut Grade", "Ideal"],
    ] as const)
      expect(acceptedPhotoFact(seen(name, value), 1, field(name, [value]))).toBe(
        false,
      );
  });

  it("still fills nothing where eBay offered nothing", () => {
    expect(
      acceptedPhotoFact(seen("Dress Length", "Midi"), 1, field("Dress Length", [])),
    ).toBe(false);
  });
});
