import { describe, expect, it } from "vitest";
import { italianSizeFix, isItalianBrand, foreignSizeInTitle, foreignSizeInDescription } from "@/lib/foreign-size";
import { sellerTextSupports } from "@/lib/note-facts";
import { tidyConditionNotes } from "@/lib/condition-sync";
import { EBAY_SCOPES } from "@/lib/ebay/config";
import type { ListingResult } from "@/lib/types";

// The seller's Prada trousers, 1 Nov 2026.
const description = `Prada Black Straight Leg Dress Pants Side Trim Trousers S Small Office Siren

These are the kind of trousers you pull on when you want to look pulled together.

Brand: Prada

Condition: Pre-owned, excellent, like new.

Size: EU 36 (US 6, Small)

Actual Measurements:
• Waist: 14 in
• Leg Opening: 6 in
• Thigh: 18 in
• Inseam: 27 in
• Rise: 9 in

Design: Flat front with belt loops. Straight leg cut.`;

describe("Italian houses: a bare number is an Italian size", () => {
  it("knows the houses", () => {
    expect(isItalianBrand("Prada")).toBe(true);
    expect(isItalianBrand("Max Mara")).toBe(true);
    expect(isItalianBrand("Weekend Max Mara")).toBe(true);
    expect(isItalianBrand("Zara")).toBe(false);
    expect(isItalianBrand("")).toBe(false);
  });
  it("Prada 36 becomes IT 36: XS, US 0 — in the size, the title and the description", () => {
    const l: ListingResult = {
      title: "Prada Black Straight Leg Dress Pants EU 36 S Small Side Trim Trousers",
      description: "Prada Black …\n\nSize: EU 36",
      brand: "Prada",
      item_type: "Pants",
      category: "Women's Pants",
      size: "EU 36",
      item_specifics: { Size: "36" },
    };
    expect(italianSizeFix(l, "36")).toBe(true);
    expect(l.size).toBe("IT 36");
    expect(foreignSizeInTitle(l.title, l)).toBe(
      "Prada Black Straight Leg Dress Pants IT 36 XS X-Small Side Trim Trousers",
    );
    expect(foreignSizeInDescription(l.description, l)).toContain("Size: IT 36 (US 0, X-Small)");
  });
  it("a label that says EU stays EU; other brands stay EU", () => {
    const marked: ListingResult = { title: "t", description: "", brand: "Prada", item_type: "Pants", size: "EU 36" };
    expect(italianSizeFix(marked, "EU 36")).toBe(false);
    const zara: ListingResult = { title: "t", description: "", brand: "Zara", item_type: "Pants", size: "EU 36" };
    expect(italianSizeFix(zara, "36")).toBe(false);
    expect(zara.size).toBe("EU 36");
  });
});

describe("fields her note answers reach eBay", () => {
  const field = (name: string, values: string[], mode: "FREE_TEXT" | "SELECTION_ONLY" = "FREE_TEXT") => ({ name, mode, values });
  const inseam = field("Inseam", ["Regular", "Short", "Tall", "26 in", "27 in", "28 in"]);
  const waist = field("Waist Size", ["26 in", "27 in", "28 in", "29 in"]);
  const rise = field("Rise", ["Ultra Low (Less than 6.5 in)", "Low (6.5-8.5 in)", "Mid (8.5-10.5 in)", "High (Greater than 10.5 in)"]);
  const leg = field("Leg Style", ["Bootcut", "Flared", "Skinny", "Straight", "Wide-Leg"]);
  const t = { title: "Prada Black Straight Leg Dress Pants", description };
  it("Inseam 27 in, Waist Size 28 in (14 flat, doubled), Rise Mid, Leg Style Straight", () => {
    expect(sellerTextSupports("27 in", inseam, t)).toBe(true);
    expect(sellerTextSupports("28 in", waist, t)).toBe(true);
    expect(sellerTextSupports("Mid (8.5-10.5 in)", rise, t)).toBe(true);
    expect(sellerTextSupports("Straight", leg, t)).toBe(true);
  });
  it("what the text does not say is still refused", () => {
    expect(sellerTextSupports("30 in", inseam, t)).toBe(false);
    expect(sellerTextSupports("26 in", waist, t)).toBe(false);
    expect(sellerTextSupports("High (Greater than 10.5 in)", rise, t)).toBe(false);
    expect(sellerTextSupports("Wide-Leg", leg, t)).toBe(false);
    // Not a word from eBay's list, and not a measurement: no.
    expect(sellerTextSupports("Wool", field("Material", ["Wool", "Cotton"]), { description: "Wool trousers" })).toBe(false);
  });
});

describe("condition notes are about condition", () => {
  it("no '(as noted by seller)', no care-tag line", () => {
    expect(
      tidyConditionNotes(
        "Excellent pre-owned condition — looks like new.\n• No care tags present (as noted by seller)\n• Neat stitching throughout, seams intact\n• Belt loops all present (per seller)\n• No stains, holes or pulls",
      ),
    ).toBe(
      "Excellent pre-owned condition: • Neat stitching throughout, seams intact • Belt loops all present • No stains, holes or pulls",
    );
  });
});

describe("eBay permissions", () => {
  it("no longer asks for orders (buyers' names and addresses)", () => {
    expect(EBAY_SCOPES).not.toContain("sell.fulfillment");
    expect(EBAY_SCOPES).toContain("sell.inventory");
    expect(EBAY_SCOPES).toContain("sell.account");
  });
});

import { xWords } from "@/lib/titleOptimizer";
import { foreignSizeLine, parseForeignSize } from "@/lib/foreign-size";

describe("X-Small and X-Large, as tags spell them (1 Nov 2026)", () => {
  it("in the title, whatever the model wrote", () => {
    expect(xWords("Zara Black Blazer XS Extra Small Office Siren")).toBe("Zara Black Blazer XS X-Small Office Siren");
    expect(xWords("Coat XL Extra Large Wool")).toBe("Coat XL X-Large Wool");
    expect(xWords("Top M Medium")).toBe("Top M Medium");
  });
  it("in the description's Size line for a European or Italian size", () => {
    expect(foreignSizeLine(parseForeignSize("IT 36")!)).toBe("Size: IT 36 (US 0, X-Small)");
    expect(foreignSizeLine(parseForeignSize("EU 46")!)).toBe("Size: EU 46 (US 16, X-Large)");
  });
  it("a title with the old words is still recognised and rewritten", () => {
    const l: ListingResult = { title: "", description: "", brand: "Zara", item_type: "Dress", size: "EU 46" };
    expect(foreignSizeInTitle("Zara Red Dress EU 46 XL Extra Large Midi", l)).toBe("Zara Red Dress EU 46 XL X-Large Midi");
  });
});
