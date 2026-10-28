import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * The seller's corrections to hashtags and Etsy tags, as they travel with an
 * analysis request and as the model reads them. Written by the program from
 * her own edits on earlier cards (lib/tag-memory.ts) — her rules for similar
 * items, never instructions about anything else.
 */
export const MAX_LESSONS = 20;

export const lessonsSchema = z.array(z.string().trim().min(1).max(400)).max(MAX_LESSONS);

export function lessonBlocks(lessons: string[] | undefined): Anthropic.ContentBlockParam[] {
  if (!lessons?.length) return [];
  return [
    {
      type: "text",
      text: [
        "THE SELLER'S CORRECTIONS on earlier listings — what she took out of and put into the hashtags and Etsy tags, newest first. Treat them as her rules for similar items: do not repeat a tag or aesthetic she removed from that kind of item, and prefer what she added. They change only the hashtags, Etsy tags and aesthetics, nothing else.",
        ...lessons.map((l) => `- ${l}`),
      ].join("\n"),
    },
  ];
}
