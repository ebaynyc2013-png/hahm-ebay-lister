import { describe, expect, it } from "vitest";
import { checkLookup, isResale, lookupEvidence, lookupFacts, LOOKUP_RULES } from "@/lib/product-lookup";

const saks = {
  status: "found" as const,
  source: { site: "Saks Fifth Avenue", title: "Marc Jacobs The Large Patchwork Denim Tote Bag", url: "https://www.saksfifthavenue.com/product/marc-jacobs-the-large-tote" },
  product_name: "Marc Jacobs The Large Patchwork Denim Tote Bag",
  model_name: "The Tote Bag Large",
  official_color: "Blue Multi",
  material: "100% cotton; leather trim",
  dimensions: '13.4"H x 16.5"W x 6.3"D',
  country: "Imported",
  retail_price: "$325",
  other_facts: ["Detachable, adjustable crossbody strap"],
};

describe("finding the item online (12 Nov 2026)", () => {
  it("a store page that names the brand is found; Imported is not a country", () => {
    const r = checkLookup(saks, "Marc Jacobs");
    expect(r.status).toBe("found");
    expect(r.country).toBe("");
    expect(r.retail_price).toBe("$325");
  });
  it("a resale page is never the source", () => {
    expect(isResale("https://www.poshmark.com/listing/x")).toBe(true);
    expect(isResale("https://www.ebay.com/itm/1")).toBe(true);
    expect(isResale("https://www.saksfifthavenue.com/p")).toBe(false);
    const r = checkLookup({ ...saks, source: { site: "Poshmark", title: "MJ tote", url: "https://poshmark.com/listing/1" } }, "Marc Jacobs");
    expect(r.status).toBe("not_found");
    expect(r.resale?.[0].url).toContain("poshmark");
    expect(r.material).toBeUndefined();
  });
  it("a page that does not name the brand is only similar — no facts", () => {
    const r = checkLookup({ ...saks, product_name: "Patchwork Denim Tote", source: { site: "Nordstrom", title: "Patchwork Denim Tote", url: "https://www.nordstrom.com/s/x" } }, "Marc Jacobs");
    expect(r.status).toBe("similar");
    expect(r.material).toBeUndefined();
  });
  it("the facts go in as the most reliable source; colour name only in the description; never the store or price", () => {
    const f = lookupFacts(checkLookup(saks, "Marc Jacobs"));
    expect(f).toContain("they win over the tag, the measurements and the seller's notes");
    expect(f).toContain("Material and composition: 100% cotton; leather trim");
    expect(f).toContain('mention it in the description\'s Color line only');
    expect(f).toContain("Never mention the store, the website or the price");
    expect(f).not.toContain("$325");
    expect(lookupEvidence(checkLookup(saks, "Marc Jacobs"))).toContain("100% cotton");
  });
  it("tells the searcher: 3 searches, no resale sites, strict match, no memory", () => {
    expect(LOOKUP_RULES).toContain("at most 3 searches");
    expect(LOOKUP_RULES).toContain("NEVER use resale or marketplace sites as a source of facts");
    expect(LOOKUP_RULES).toContain("Never fill a fact from your own memory");
  });
});
