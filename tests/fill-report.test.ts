import { describe, expect, it } from "vitest";
import { describeFill, type FillReport } from "@/lib/ebay/aspectFill";

// The photo-analysis pass is best-effort: it leaves the aspects untouched on
// any failure and says nothing. Four runs in a row were spent asking whether
// a field had been considered and passed over, or never looked at — a
// question neither the finished screen nor Vercel's logs on this plan could
// answer. This sentence answers it.
const report = (over: Partial<FillReport> = {}): FillReport => ({
  ran: true,
  photos: 3,
  offered: 12,
  returned: 0,
  refused: 0,
  added: 0,
  changed: [],
  note: "",
  ...over,
});

describe("describeFill", () => {
  it("names what was filled", () => {
    expect(
      describeFill(
        report({ returned: 4, added: 2, changed: ["Style", "Features"] }),
      ),
    ).toBe("ran (3 photos), filled 2: Style, Features");
  });

  it("separates 'nothing to add' from 'never looked at'", () => {
    // The distinction the whole report exists for.
    expect(describeFill(report({ returned: 5 }))).toContain(
      "nothing new to add",
    );
    expect(
      describeFill(report({ ran: false, note: "did not finish in time" })),
    ).toBe("did not finish in time");
  });

  it("says when the model was asked and proposed nothing", () => {
    expect(describeFill(report())).toContain("proposed nothing");
  });

  it("calls out a run with no photos, where nothing can be cited", () => {
    // Every photo-grounded fact needs a photo index to cite. With no photos
    // sent, all of them are refused however good the answers are — the
    // failure this report was written to make visible.
    const line = describeFill(
      report({ photos: 0, returned: 6, refused: 6 }),
    );
    expect(line).toContain("no photos");
    expect(line).toContain("refused");
  });

  it("reports refusals alongside what did land", () => {
    expect(
      describeFill(
        report({ returned: 5, refused: 3, added: 2, changed: ["Style"] }),
      ),
    ).toContain("(3 refused)");
  });

  it("passes an early exit straight through", () => {
    expect(
      describeFill(
        report({ ran: false, offered: 0, note: "nothing to do — every field eBay asks for was already answered" }),
      ),
    ).toContain("already answered");
  });
});
