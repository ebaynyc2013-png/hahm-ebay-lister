import { describe, expect, it } from "vitest";
import { applyRevision } from "@/lib/revise";
import { ringSizeInTitle } from "@/lib/ring-size";
import { otherSizeInTitle } from "@/lib/size-conversions";
import { shoeSizeInDescription, shoeSizeLine } from "@/lib/title-shoe-size";
import type { ListingResult } from "@/lib/types";

// The seller, 21 Nov 2026, looking at her listings in the working copy:
// a Chloé sandal's title said "37" only, and a Pandora ring's "Size 56" only.
// "It should say both" — in the title and in the description, always.

const ring: ListingResult = {
  title: "",
  description: "",
  item_type: "Ring",
  brand: "Pandora",
  size: "EU 56",
};
const RING_TITLE = "Pandora Sterling Silver Cubic Zirconia Double Halo Ring Size 56 Beaded Band";

describe("a ring keeps both sizes in the title", () => {
  it("the real Pandora ring: no room for 'Size', so the word goes — both sizes stay", () => {
    const out = ringSizeInTitle(RING_TITLE, ring);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toBe("Pandora Sterling Silver Cubic Zirconia Double Halo Ring EU 56 US 7.5 Beaded Band");
  });

  it("with room, the full form", () => {
    expect(ringSizeInTitle("Pandora Silver Halo Ring Size 56", ring)).toBe(
      "Pandora Silver Halo Ring Size EU 56 US 7.5",
    );
  });

  it("tighter still: words go from after the sizes, then from just before — never a size", () => {
    const long = "Pandora Sterling Silver Cubic Zirconia Sparkling Double Halo Ring Size 56 Beaded Band Gift";
    const out = ringSizeInTitle(long, ring);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toContain("EU 56 US 7.5");
  });

  it("men's tailoring keeps both too", () => {
    const l: ListingResult = { title: "", description: "", item_type: "Blazer", size: "EU 50", item_specifics: { Department: "Men" } };
    const t = `${"Word ".repeat(13)}Blazer EU 50`;
    const out = otherSizeInTitle(t, l);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toContain("EU 50 US 40");
  });
});

describe("a shoe's description says both sizes, US first", () => {
  const sandals: ListingResult = { title: "", description: "", item_type: "Sandals", size: "EU 37" };

  it("from the title's pair, so the two always agree", () => {
    expect(shoeSizeLine({ ...sandals, title: "Chloe Sandals Size 6.5 EU 37 Block Heel" })).toBe("Size: 6.5 (EU 37)");
    expect(shoeSizeLine({ ...sandals, title: "Pumps 7M EU 37.5 Heels", size: "US 7M" })).toBe("Size: 7M (EU 37.5)");
  });

  it("from the size read when the title has no pair", () => {
    expect(shoeSizeLine({ ...sandals, title: "Chloe Sandals" })).toBe("Size: 6.5 (EU 37)");
    expect(shoeSizeLine({ ...sandals, title: "Pumps", size: "US 7M" })).toBe("Size: 7M (EU 37.5)");
    // A bare small number could be British — not guessed.
    expect(shoeSizeLine({ ...sandals, title: "Pumps", size: "7" })).toBeNull();
  });

  it("replaces the line written, or adds one", () => {
    const l = { ...sandals, title: "Chloe Sandals Size 6.5 EU 37" };
    expect(shoeSizeInDescription("Chloe Sandals Size 6.5 EU 37\n\nBrand: Chloe\n\nSize: 37\n\nColor: Yellow", l)).toBe(
      "Chloe Sandals Size 6.5 EU 37\n\nBrand: Chloe\n\nSize: 6.5 (EU 37)\n\nColor: Yellow",
    );
    expect(shoeSizeInDescription("Chloe Sandals Size 6.5 EU 37\n\nBrand: Chloe", l)).toBe(
      "Chloe Sandals Size 6.5 EU 37\n\nBrand: Chloe\n\nSize: 6.5 (EU 37)",
    );
  });

  it("kids' and baby shoes keep their own line", () => {
    expect(shoeSizeLine({ ...sandals, item_type: "Kids Sneakers", size: "EU 28" })).toBeNull();
    expect(shoeSizeLine({ ...sandals, item_type: "Baby Shoes", size: "EU 17" })).toBeNull();
  });

  it("not a shoe — nothing", () => {
    expect(shoeSizeLine({ ...sandals, item_type: "Top" })).toBeNull();
  });
});

describe("a rewrite never takes a size away (search online, Update with notes)", () => {
  it("the Pandora ring found online: title and description get both sizes", () => {
    const before: ListingResult = {
      ...ring,
      title: "Pandora Silver Double Halo Ring Size EU 56 US 7.5",
      description: "Pandora Silver Double Halo Ring Size EU 56 US 7.5\n\nBrand: Pandora\n\nSize: EU 56 (US 7.5)",
    };
    const { patch } = applyRevision(before, {
      title: "Pandora Sparkling Double Halo Ring Size 56 Sterling Silver",
      description: "x\n\nBrand: Pandora\n\nRing Size: EU 56",
    });
    expect(patch.title).toBe("Pandora Sparkling Double Halo Ring Size EU 56 US 7.5 Sterling Silver");
    expect(patch.description).toContain("Size: EU 56 (US 7.5)");
    expect(patch.description?.split("\n")[0]).toBe(patch.title);
  });

  it("a shoe rewritten: 'Size 6.5 EU 37' and 'Size: 6.5 (EU 37)'", () => {
    const before: ListingResult = { title: "Chloe Sandals Size 6.5 EU 37", description: "", item_type: "Sandals", size: "EU 37" };
    const { patch } = applyRevision(before, {
      title: "Chloe Yellow Leather Sandals EU 37 Block Heel",
      description: "x\n\nBrand: Chloe\n\nSize: 37",
    });
    expect(patch.title).toBe("Chloe Yellow Leather Sandals Size 6.5 EU 37 Block Heel");
    expect(patch.description).toContain("Size: 6.5 (EU 37)");
  });

  it("a title the rewrite left as it was is not marked changed", () => {
    const before: ListingResult = { ...ring, title: "Pandora Silver Halo Ring Size EU 56 US 7.5", description: "" };
    const { changed } = applyRevision(before, { title: "Pandora Silver Halo Ring Size EU 56 US 7.5" });
    expect(changed).not.toContain("Title");
  });
});
