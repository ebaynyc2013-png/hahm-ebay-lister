import { z } from "zod";
import { toImageBlock } from "./images";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * The seller's confirmed marks, as they travel with an analysis request and
 * as the model sees them: after the item's own photos, each labelled with its
 * maker, so they can be compared but never cited as photos of the item (photo
 * numbers count the item's photos only).
 */
export const MAX_REFERENCES = 8;

export const referencesSchema = z
  .array(
    z.object({
      brand: z.string().trim().min(1).max(100),
      marks: z.array(z.string().max(300)).max(6),
      image: z
        .object({
          mediaType: z.string().max(30),
          // The small on-screen copy — a few tens of kilobytes.
          data: z.string().max(200_000),
        })
        .optional(),
    }),
  )
  .max(MAX_REFERENCES);

export type MarkReferenceInput = z.infer<typeof referencesSchema>;

export function referenceBlocks(
  refs: MarkReferenceInput | undefined,
): Anthropic.ContentBlockParam[] {
  if (!refs?.length) return [];
  const blocks: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: "REFERENCE photos follow: maker's marks the seller has confirmed on earlier pieces. They are NOT photos of this item — never cite them. Compare their details with the marks on this item; an exact match of details counts as one strong mark, never as the whole answer.",
    },
  ];
  refs.forEach((r, i) => {
    blocks.push({
      type: "text",
      text: `Reference R${i + 1} — confirmed by the seller as ${r.brand}: ${r.marks.join("; ") || "(no description)"}`,
    });
    const img = r.image ? toImageBlock(r.image) : null;
    if (img) blocks.push(img);
  });
  return blocks;
}
