// What the seller typed in the item's Notes box (12 Nov 2026): facts she
// knows that the photos may not show — "copper flower, bronze disc", "zipper
// works", "bought in 1985". Sent with the photos, after them, so the photo
// numbers stay the item's own.

export const SELLER_NOTES_RULES = `THE SELLER'S TYPED NOTES — when the photos are followed by a block headed "THE SELLER'S NOTES FOR THIS ITEM", those are her own words about this item. They count exactly like her photographed note: a fact she states there is true — the metal, the material, the age, a measurement, what works — and it wins over a screenshot of another listing and over anything the photos only suggest. Use every fact in them where it belongs: the title, the description, the condition notes and the item specifics (a specific from them: basis "label", quote her words exactly, photoIndices []). Never add to them, and never write that a fact came from her notes. When her notes and a screenshot or a label disagree, follow her notes and report the disagreement in "doubts".`;

export function sellerNotesBlocks(notes: string | undefined): { type: "text"; text: string }[] {
  const n = String(notes ?? "").trim();
  if (!n) return [];
  return [
    {
      type: "text",
      text: `THE SELLER'S NOTES FOR THIS ITEM (typed by her — facts she knows):\n${n.slice(0, 2000)}`,
    },
  ];
}
