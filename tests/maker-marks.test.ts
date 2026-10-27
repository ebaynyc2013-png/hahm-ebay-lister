import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyChosenBrand,
  applyMakerMarkRules,
  brandNeedsConfirmation,
  photoNumberOfMark,
} from "@/lib/maker-marks";
import {
  forgetBrandMark,
  imageFromDataUrl,
  loadBrandMarks,
  MAX_REFERENCES,
  referencesForAnalysis,
  rememberBrandMark,
} from "@/lib/brand-memory";
import { referenceBlocks, referencesSchema } from "@/lib/brand-references";
import { draftIssues } from "@/lib/client-review";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import { AI_LISTING_SCHEMA } from "@/lib/ai-schema";
import type { ItemGroup, ListingResult } from "@/lib/types";

const CROWN = "Photo 2: small gold crown-shaped tag at the end of the extender chain";

describe("a maker's mark is never 'Unbranded'", () => {
  it("empties the brand and drops the Unbranded line when a mark is visible", () => {
    // The real Premier Designs necklace, as the model first wrote it.
    const l: ListingResult = {
      title: "Gold Brown Twisted Cord Hammered Open Diamond Pendant Necklace Boho",
      description: "Gold Brown Twisted Cord Pendant Necklace\n\nBrand: Unbranded\n\nCondition: Very good.",
      brand: "Unbranded",
      item_specifics: { Brand: "Unbranded", Color: "Gold" },
      maker_marks: [CROWN],
      brand_source: "none",
    };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("");
    expect(l.item_specifics).toEqual({ Color: "Gold" });
    expect(l.description).toBe("Gold Brown Twisted Cord Pendant Necklace\n\nCondition: Very good.");
    expect(brandNeedsConfirmation(l)).toBe(false);
  });

  it("keeps Unbranded where no mark is seen", () => {
    const l: ListingResult = { title: "x", description: "Brand: Unbranded", brand: "Unbranded", maker_marks: [] };
    applyMakerMarkRules(l);
    expect(l.brand).toBe("Unbranded");
    expect(l.description).toBe("Brand: Unbranded");
  });

  it("holds a brand read from several marks until the seller confirms it", () => {
    const l: ListingResult = {
      title: "Premier Designs Gold Pendant Necklace",
      description: "",
      brand: "Premier Designs",
      brand_source: "marks",
      maker_marks: [CROWN, "Photo 3: crown stamped on the cord end caps"],
    };
    applyMakerMarkRules(l);
    expect(brandNeedsConfirmation(l)).toBe(true);
    const g: ItemGroup = { id: "g", sku: "SKU-1", name: "n", photoIds: ["p"], status: "done", listing: l };
    expect(draftIssues(g).join(" ")).toContain("Confirm the brand Premier Designs");
    l.brand_confirmed = true;
    expect(draftIssues(g).join(" ")).not.toContain("Confirm the brand");
  });

  it("never asks to confirm a name read on the piece", () => {
    const l: ListingResult = { title: "x", description: "", brand: "Monet", brand_source: "label", maker_marks: ["Photo 3: MONET stamped on the clasp"] };
    applyMakerMarkRules(l);
    expect(brandNeedsConfirmation(l)).toBe(false);
  });

  it("keeps only real, different candidates", () => {
    const l: ListingResult = {
      title: "x",
      description: "",
      brand: "",
      maker_marks: [CROWN],
      brand_candidates: [
        { brand: "Premier Designs", why: "crown tag on the extender" },
        { brand: "Juicy Couture", why: "uses crowns" },
        { brand: "premier designs", why: "again" },
        { brand: "Unbranded", why: "" },
        { brand: "", why: "nothing" },
      ],
    };
    applyMakerMarkRules(l);
    expect(l.brand_candidates?.map((c) => c.brand)).toEqual(["Premier Designs", "Juicy Couture"]);
  });
});

describe("the seller picks the brand", () => {
  const base: ListingResult = {
    title: "Gold Brown Twisted Cord Open Diamond Pendant Necklace",
    description: "Gold Brown Twisted Cord Open Diamond Pendant Necklace\n\nCondition: Very good.",
    brand: "",
    item_specifics: { Color: "Gold" },
  };

  it("puts it in the title, the Brand field and the description", () => {
    const { listing, titleUpdated } = applyChosenBrand(base, "Premier Designs");
    expect(titleUpdated).toBe(true);
    expect(listing.title).toBe("Premier Designs Gold Brown Twisted Cord Open Diamond Pendant Necklace");
    expect(listing.item_specifics).toEqual({ Color: "Gold", Brand: "Premier Designs" });
    expect(listing.description).toBe(
      "Premier Designs Gold Brown Twisted Cord Open Diamond Pendant Necklace\n\nBrand: Premier Designs\n\nCondition: Very good.",
    );
    expect(listing.brand_confirmed).toBe(true);
    expect(listing.brand_source).toBe("seller");
  });

  it("keeps Vintage and the era first", () => {
    const { listing } = applyChosenBrand({ ...base, title: "Vintage 90s Gold Pendant Necklace" }, "Monet");
    expect(listing.title).toBe("Vintage 90s Monet Gold Pendant Necklace");
  });

  it("leaves a full title alone and says so", () => {
    const long = "Gold Brown Twisted Cord Hammered Open Diamond Pendant Necklace Statement Boho";
    const { listing, titleUpdated } = applyChosenBrand({ ...base, title: long }, "Premier Designs");
    expect(titleUpdated).toBe(false);
    expect(listing.title).toBe(long);
    expect(listing.brand).toBe("Premier Designs");
  });

  it("finds the photo a mark was seen on", () => {
    expect(photoNumberOfMark(CROWN)).toBe(2);
    expect(photoNumberOfMark("crown on the clasp")).toBeNull();
  });
});

describe("the brand memory", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase("listing-writer-drafts");
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  });

  it("keeps confirmed marks, newest first, and forgets on request", async () => {
    const a = await rememberBrandMark({ brand: "Premier Designs", marks: [CROWN], image: imageFromDataUrl("data:image/jpeg;base64,QUJD") });
    await new Promise((r) => setTimeout(r, 5));
    await rememberBrandMark({ brand: "Monet", marks: ["Photo 1: MONET on the clasp"] });
    expect((await loadBrandMarks()).map((m) => m.brand)).toEqual(["Monet", "Premier Designs"]);
    expect((await loadBrandMarks())[1].image).toEqual({ mediaType: "image/jpeg", data: "QUJD" });
    await forgetBrandMark(a.id);
    expect((await loadBrandMarks()).map((m) => m.brand)).toEqual(["Monet"]);
  });

  it("sends only the newest few with an analysis", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      brand: `Maker ${i}`,
      marks: ["mark"],
      savedAt: 100 - i,
    }));
    const refs = referencesForAnalysis(many);
    expect(refs).toHaveLength(MAX_REFERENCES);
    expect(refs[0].brand).toBe("Maker 0");
  });
});

describe("references as the model sees them", () => {
  it("labels each one and keeps it apart from the item's photos", () => {
    const refs = referencesSchema.parse([
      { brand: "Premier Designs", marks: [CROWN], image: { mediaType: "image/jpeg", data: "QUJD" } },
    ]);
    const blocks = referenceBlocks(refs);
    expect(blocks[0]).toMatchObject({ type: "text" });
    expect((blocks[0] as { text: string }).text).toContain("NOT photos of this item");
    expect((blocks[1] as { text: string }).text).toBe(
      `Reference R1 — confirmed by the seller as Premier Designs: ${CROWN}`,
    );
    expect(blocks[2]).toMatchObject({ type: "image" });
    expect(referenceBlocks([])).toEqual([]);
  });

  it("refuses an oversized set", () => {
    const nine = Array.from({ length: 9 }, () => ({ brand: "X", marks: [] }));
    expect(referencesSchema.safeParse(nine).success).toBe(false);
  });
});

describe("the model is told the seller's rules", () => {
  const prompt = buildProfiledAnalysisPrompt("jewelry");

  it("names a brand only from several marks, never from one shared mark", () => {
    expect(prompt).toContain("ONLY when SEVERAL independent marks agree");
    expect(prompt).toContain("ONE mark, or marks that several makers share");
    expect(prompt).toContain("Never prefer a maker because it is pricier");
    expect(prompt).toContain('NEVER "Unbranded" when any maker\'s mark is visible');
    expect(prompt).not.toContain("KNOWN MAKER'S MARKS");
  });

  it("looks for marks before naming the brand, and offers candidates", () => {
    const order = Object.keys(AI_LISTING_SCHEMA.properties);
    expect(order.indexOf("maker_marks")).toBeLessThan(order.indexOf("brand"));
    expect(order.indexOf("brand_source")).toBe(order.indexOf("brand") + 1);
    expect(order.indexOf("brand_candidates")).toBe(order.indexOf("brand") + 2);
    expect(AI_LISTING_SCHEMA.required).toEqual(
      expect.arrayContaining(["maker_marks", "brand_source", "brand_candidates"]),
    );
  });
});
