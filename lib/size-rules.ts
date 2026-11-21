// Every size rule for the title and the description in one place, for a
// listing rewritten after its first writing — by the search online ("Found
// online · Updated: Title · Description") or by Update with notes. The first
// writing applies the same rules in lib/analyze-core.ts.
//
// 21 Nov 2026: a Pandora ring found online came back "…Ring Size 56 Beaded
// Band" — the rewrite had no size rules, so the American size the seller wants
// beside the European one was never added (she: "it should say both").
//
// Client-safe: no server imports.

import { foreignSizeInDescription, foreignSizeInTitle } from "./foreign-size";
import { ringSizeInDescription, ringSizeInTitle } from "./ring-size";
import { otherSizeInDescription, otherSizeInTitle } from "./size-conversions";
import { fitTitle } from "./title-fit";
import { shoeSizeInDescription, shoeSizesInTitle } from "./title-shoe-size";
import type { ListingResult } from "./types";

/** The title with both sizes, as the first writing gives them. */
export function titleWithSizes(title: string, l: ListingResult): string {
  const x = { ...l, title };
  const t = foreignSizeInTitle(shoeSizesInTitle(fitTitle(title, 80), x, 80), x, 80);
  return fitTitle(otherSizeInTitle(ringSizeInTitle(t, x), x), 80);
}

/** The description's Size line with both sizes; `l.title` is the final title. */
export function descriptionWithSizes(description: string, l: ListingResult): string {
  let d = foreignSizeInDescription(description, l);
  d = ringSizeInDescription(d, l);
  d = otherSizeInDescription(d, l);
  return shoeSizeInDescription(d, l);
}
