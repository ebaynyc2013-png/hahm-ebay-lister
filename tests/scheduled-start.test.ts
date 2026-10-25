import { describe, expect, it } from "vitest";
import { SCHEDULE_DELAY_HOURS, scheduledStart } from "@/lib/ebay/publish";

// eBay has no API for Seller Hub drafts, and its own suggested item specifics
// appear only on Revise. A delayed start is the window to accept them before
// the listing goes live.
describe("scheduledStart", () => {
  it("starts the listing a day out", () => {
    expect(SCHEDULE_DELAY_HOURS).toBe(24);
    const now = Date.UTC(2026, 9, 25, 9, 0, 0);
    expect(scheduledStart(now)).toBe("2026-10-26T09:00:00.000Z");
  });

  it("is in UTC with a Z, as eBay's timestamp fields expect", () => {
    expect(scheduledStart()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});
