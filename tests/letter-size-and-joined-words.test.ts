import { describe, expect, it } from "vitest";
import { letterOnly, letterOnlyInDescription } from "@/lib/letter-size";
import { allowedValuesFrom } from "@/lib/ebay/aspectFill";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

describe("a letter size is one value outside the title (10 Nov 2026)", () => {
  it.each([
    ["M Medium", "M"],
    ["XS X-Small", "XS"],
    ["xl x-large", "XL"],
    ["L Large", "L"],
    ["S Small", "S"],
    ["M", "M"],
    ["EU 38", "EU 38"],
    ["EU 38 M Medium", "EU 38 M Medium"],
    ["7M 37.5", "7M 37.5"],
    ["Size 8", "Size 8"],
    ["M Large", "M Large"],
  ])("%s → %s", (input, out) => {
    expect(letterOnly(input)).toBe(out);
  });

  it("the description's Size line keeps only the letter", () => {
    const d = "Reebok Tank Top M Medium\n\nBrand: Reebok\n\nSize: M Medium\n\nColor: Neon red";
    expect(letterOnlyInDescription(d)).toBe(
      "Reebok Tank Top M Medium\n\nBrand: Reebok\n\nSize: M\n\nColor: Neon red",
    );
  });

  it("a European size line is left alone", () => {
    const d = "Size: EU 38 (US 8, Medium)";
    expect(letterOnlyInDescription(d)).toBe(d);
  });
});

const meta = (name: string, values: string[]): AspectMeta =>
  ({ name, values, mode: "SELECTION_ONLY", cardinality: "MULTI", required: false }) as unknown as AspectMeta;

describe("one side of eBay's joined value is that value", () => {
  const perf = meta("Performance/Activity", [
    "Cross Training", "CrossFit", "Gym & Training", "Running & Jogging", "Weightlifting", "Yoga",
  ]);

  it("the Reebok tank: Gym, Training, Running, Jogging", () => {
    const missed: string[] = [];
    const vals = allowedValuesFrom(["Gym", "Training", "Running", "Jogging", "Yoga"], perf, missed);
    expect(vals).toEqual(["Yoga", "Running & Jogging", "Gym & Training"]);
    expect(missed).toEqual([]);
  });

  it("a word with no single home stays refused", () => {
    const m = meta("Activity", ["Hiking & Camping", "Hiking & Walking"]);
    const missed: string[] = [];
    expect(allowedValuesFrom(["Hiking"], m, missed)).toEqual([]);
    expect(missed).toEqual(["Hiking"]);
  });

  it("colours are never joined: Black is not Black & White", () => {
    const m = meta("Color", ["Black", "Black & White", "White"]);
    expect(allowedValuesFrom(["Black"], m)).toEqual(["Black"]);
    const m2 = meta("Color", ["Black & White", "Red"]);
    expect(allowedValuesFrom(["Black"], m2)).toEqual([]);
  });

  it("slash values work too", () => {
    const m = meta("Closure", ["Hook & Eye", "Snap/Button", "Zip"]);
    expect(allowedValuesFrom(["Snap"], m)).toEqual(["Snap/Button"]);
  });
});
