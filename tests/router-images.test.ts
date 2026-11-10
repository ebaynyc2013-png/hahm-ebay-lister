import { describe, expect, it } from "vitest";
import { smallCopiesForRouting } from "../lib/router-images";
import { routerImagesSchema } from "../lib/validation";

const thumb = (s: string) => ({ previewUrl: `data:image/jpeg;base64,${s}` });
const full = (s: string) => ({ mediaType: "image/jpeg", data: s });

describe("smallCopiesForRouting", () => {
  it("sends the small copies in the same order as the full photos", () => {
    const out = smallCopiesForRouting([thumb("AAA"), thumb("BBB")], [full("X"), full("Y")]);
    expect(out).toEqual([
      { mediaType: "image/jpeg", data: "AAA" },
      { mediaType: "image/jpeg", data: "BBB" },
    ]);
  });

  it("sends nothing when the counts differ", () => {
    expect(smallCopiesForRouting([thumb("AAA")], [full("X"), full("Y")])).toBeUndefined();
  });

  it("sends nothing when a small copy is not a data URL", () => {
    expect(
      smallCopiesForRouting([{ previewUrl: "blob:https://x/1" }], [full("X")]),
    ).toBeUndefined();
  });

  it("sends nothing when the whole request would get too big", () => {
    const big = "A".repeat(3_900_000);
    expect(smallCopiesForRouting([thumb("A".repeat(200_000))], [full(big)])).toBeUndefined();
  });

  it("counts the brand-mark pictures toward the request size", () => {
    const refs = [{ image: { data: "A".repeat(1_500_000) } }];
    expect(
      smallCopiesForRouting([thumb("AAA")], [full("A".repeat(2_600_000))], refs),
    ).toBeUndefined();
    expect(smallCopiesForRouting([thumb("AAA")], [full("A".repeat(2_600_000))])).toHaveLength(1);
  });

  it("sends nothing when the small copies alone are over their budget", () => {
    const t = thumb("A".repeat(400_000));
    expect(smallCopiesForRouting([t, t], [full("X"), full("Y")])).toBeUndefined();
  });

  it("produces what the server accepts", () => {
    const out = smallCopiesForRouting([thumb("AAA")], [full("X")]);
    expect(routerImagesSchema.safeParse(out).success).toBe(true);
  });

  it("sends nothing for no photos", () => {
    expect(smallCopiesForRouting([], [])).toBeUndefined();
  });
});
