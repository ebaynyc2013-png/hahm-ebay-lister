import { describe, expect, it } from "vitest";
import { offerChoice, offerProblem } from "@/lib/offers";
import { offerTerms } from "@/lib/ebay/publish";

// "Allow offers" on by default, with a "Minimum offer amount" (1 Nov 2026).
describe("the card's choice", () => {
  it("offers are on unless turned off", () => {
    expect(offerChoice({})).toEqual({ allow: true, minimum: null });
    expect(offerChoice({ allowOffers: false, minOffer: 20 })).toEqual({ allow: false, minimum: null });
    expect(offerChoice({ minOffer: 18.5 })).toEqual({ allow: true, minimum: 18.5 });
    expect(offerChoice({ minOffer: "" })).toEqual({ allow: true, minimum: null });
    expect(offerChoice({ minOffer: 0 })).toEqual({ allow: true, minimum: null });
  });
  it("a minimum at or above the price is flagged before posting", () => {
    expect(offerProblem({ allow: true, minimum: 30 }, 25)).toMatch(/must be less than the price/);
    expect(offerProblem({ allow: true, minimum: 25 }, "25")).toMatch(/must be less than/);
    expect(offerProblem({ allow: true, minimum: 20 }, 25)).toBe("");
    expect(offerProblem({ allow: false, minimum: null }, 25)).toBe("");
  });
});

describe("what goes to eBay", () => {
  const ok = { supported: true, autoDecline: true };
  it("offers on with a minimum: eBay's auto-decline price", () => {
    expect(offerTerms(true, 18, 25, ok)).toEqual({
      terms: { bestOfferEnabled: true, autoDeclinePrice: { value: "18.00", currency: "USD" } },
      warnings: [],
    });
  });
  it("offers on, no minimum", () => {
    expect(offerTerms(true, "", 25, ok)).toEqual({ terms: { bestOfferEnabled: true }, warnings: [] });
  });
  it("offers off: nothing", () => {
    expect(offerTerms(false, 18, 25, ok)).toEqual({ warnings: [] });
  });
  it("a category without offers posts without them, and says so", () => {
    const r = offerTerms(true, 18, 25, { supported: false, autoDecline: false });
    expect(r.terms).toBeUndefined();
    expect(r.warnings[0]).toMatch(/does not take offers/);
  });
  it("a category without auto-decline keeps offers, drops the minimum, and says so", () => {
    const r = offerTerms(true, 18, 25, { supported: true, autoDecline: false });
    expect(r.terms).toEqual({ bestOfferEnabled: true });
    expect(r.warnings[0]).toMatch(/no minimum offer/);
  });
  it("eBay could not be asked: her choice goes as it is", () => {
    expect(offerTerms(true, 18, 25, null).terms?.autoDeclinePrice?.value).toBe("18.00");
  });
  it("a minimum at or above the price is refused", () => {
    expect(() => offerTerms(true, 25, 25, ok)).toThrow(/must be less than the price/);
  });
});
