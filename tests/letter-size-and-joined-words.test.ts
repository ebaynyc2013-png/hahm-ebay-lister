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

import { applySportsTheme } from "@/lib/listing-defaults";

describe("Theme: Sports, not 3D, for sportswear (10 Nov 2026)", () => {
  const meta = [{ name: "Theme", values: ["3D", "Classic", "Colorful", "Sports"] }];
  const path = "Clothing, Shoes & Accessories > Women > Women's Clothing > Activewear > Activewear Tops";
  const tank = { maker_marks: ["Photo 1,2,3: PW3R SP3ED STR3NGTH graphic with P3 3D logo"] };

  it("the Reebok tank: 3D → Sports", () => {
    const a: Record<string, string[]> = { Theme: ["3D"] };
    expect(applySportsTheme(a, meta, tank, path)).toBe(true);
    expect(a.Theme).toEqual(["Sports"]);
  });

  it("keeps other honest themes and adds Sports first", () => {
    const a: Record<string, string[]> = { Theme: ["3D", "Colorful"] };
    applySportsTheme(a, meta, tank, path);
    expect(a.Theme).toEqual(["Sports", "Colorful"]);
  });

  it("an empty Theme on sportswear is Sports", () => {
    const a: Record<string, string[]> = {};
    applySportsTheme(a, meta, { maker_marks: [] }, path);
    expect(a.Theme).toEqual(["Sports"]);
  });

  it("outside sportswear, 3D from printed letters is dropped", () => {
    const a: Record<string, string[]> = { Theme: ["3D", "Classic"] };
    applySportsTheme(a, meta, tank, "Clothing, Shoes & Accessories > Women > Women's Clothing > Tops");
    expect(a.Theme).toEqual(["Classic"]);
  });

  it("outside sportswear, a real 3D design is kept", () => {
    const a: Record<string, string[]> = { Theme: ["3D"] };
    expect(applySportsTheme(a, meta, { maker_marks: [] }, "Women's Clothing > Tops")).toBe(false);
    expect(a.Theme).toEqual(["3D"]);
  });

  it("an activewear Theme without 3D is left alone", () => {
    const a: Record<string, string[]> = { Theme: ["Colorful"] };
    expect(applySportsTheme(a, meta, { maker_marks: [] }, path)).toBe(false);
    expect(a.Theme).toEqual(["Colorful"]);
  });
});
