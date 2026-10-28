import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * The seller's phrases as they travel with an analysis request and as the
 * model reads them (see style-phrases.ts and style-rotation.ts).
 */
export const phrasesSchema = z
  .array(
    z.object({
      id: z.string().max(40),
      kind: z.string().max(20),
      stone: z.string().max(40).optional(),
      text: z.string().max(800),
    }),
  )
  .max(60);

export type PhraseInput = z.infer<typeof phrasesSchema>;

export function phraseBlocks(phrases: PhraseInput | undefined): Anthropic.ContentBlockParam[] {
  if (!phrases?.length) return [];
  const lines = phrases.map((p) =>
    p.kind === "gems"
      ? `[${p.id}] (only if the stone is ${p.stone}, named by a label or the seller's note) ${p.text}`
      : `[${p.id}] (${p.kind}) ${p.text}`,
  );
  return [
    {
      type: "text",
      text: [
        "THE SELLER'S OWN PHRASES, offered in turn. Pick the ONE that best fits this item and model the opening sentence of the description on it — its turn of phrase and tone, NOT its facts. Put its id in \"style_phrase_id\". Any phrase may be adapted to any item.",
        ...lines,
      ].join("\n"),
    },
  ];
}
