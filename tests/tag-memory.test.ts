import { describe, expect, it } from "vitest";
import { describeLesson, lessonFromEdit, lessonsForAnalysis } from "@/lib/tag-memory";
import { lessonBlocks, lessonsSchema } from "@/lib/tag-lessons";

const SHORTS = { item_type: "Shorts", title: "Levi's Blue Denim High Waist Shorts M Medium" };

describe("the program learns from the seller's tag corrections (28 Oct 2026)", () => {
  it("records what she took out and put in, with the kind of item", () => {
    const l = lessonFromEdit(
      "hashtags",
      ["#denimshorts", "#highwaistshorts", "#coastalcowgirl", "#western", "#y2kstyle"],
      ["#denimshorts", "#highwaistshorts", "#coastalcowgirl", "#western", "#70s"],
      SHORTS,
    );
    expect(l).toEqual({
      kind: "hashtags",
      item: "Shorts",
      title: "Levi's Blue Denim High Waist Shorts M Medium",
      removed: ["#y2kstyle"],
      added: ["#70s"],
    });
    expect(describeLesson(l!)).toBe(
      'Shorts ("Levi\'s Blue Denim High Waist Shorts M Medium") — hashtags: removed #y2kstyle; added #70s',
    );
  });

  it("learns nothing from a change of order or of letter case", () => {
    expect(lessonFromEdit("etsy", ["cord necklace", "boho necklace"], ["Boho Necklace", "cord necklace"], SHORTS)).toBeNull();
  });

  it("sends the newest corrections, at most 20, as her rules", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      kind: "etsy" as const,
      item: "Cigarette case",
      removed: ["dark academia"],
      added: [`retro glam ${i}`],
      savedAt: i,
    }));
    const lines = lessonsForAnalysis(many);
    expect(lines).toHaveLength(20);
    expect(lessonsSchema.safeParse(lines).success).toBe(true);
    const [block] = lessonBlocks(lines) as { type: "text"; text: string }[];
    expect(block.text).toContain("THE SELLER'S CORRECTIONS");
    expect(block.text).toContain("- Cigarette case — Etsy tags: removed dark academia; added retro glam 0");
    expect(lessonBlocks([])).toEqual([]);
  });

  it("refuses an oversized set rather than sinking the analysis", () => {
    expect(lessonsSchema.safeParse(Array.from({ length: 21 }, () => "x")).success).toBe(false);
  });
});
