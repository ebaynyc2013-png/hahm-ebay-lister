import { describe, expect, it } from "vitest";
import { STYLE_PHRASES } from "@/lib/style-phrases";
import { pickPhrases, PER_KIND, STATEMENT_PER_KIND } from "@/lib/style-rotation";
import { phraseBlocks, phrasesSchema } from "@/lib/style-phrase-blocks";
import {
  applyStatementStyle,
  bigWords,
  settleStatement,
  statementDoubt,
  statementFromAnalysis,
  statementOutOfTitle,
  statementTags,
  withoutStatementStyle,
} from "@/lib/statement";
import { allDoubts } from "@/lib/listing-mismatch";
import { applyRevision, reviseMessage, REVISE_RULES, REVISE_SCHEMA } from "@/lib/revise";
import { AI_LISTING_SCHEMA, FACTS_BEFORE_TITLE } from "@/lib/ai-schema";
import { buildProfiledAnalysisPrompt } from "@/lib/prompts";
import { parseListing } from "@/lib/validation";
import type { ListingResult } from "@/lib/types";

// Statement pieces — the seller's rules of 15 Nov 2026: a small pendant came
// back as "statement necklace… throw on this necklace". Statement only by a
// measurement; never "Statement" in the title; otherwise the big-piece words
// nowhere; not measured and maybe big — she is asked.

const listing = (over: Partial<ListingResult> = {}): ListingResult =>
  ({
    title: "Sterling Silver Heart Pendant Necklace 18in",
    description: "Sterling Silver Heart Pendant Necklace 18in\n\nMatters of the heart are simple.\n\nBrand: Unbranded",
    item_type: "Pendant Necklace",
    hashtags: ["#heartnecklace", "#silverpendant", "#romantic", "#minimalist", "#cottagecore"],
    etsy_tags: ["heart necklace", "silver pendant", "gift for her"],
    item_specifics: { Style: "Pendant | Statement", Metal: "Sterling Silver" },
    ...over,
  }) as ListingResult;

describe("her phrases carry a size mark (her check, 15 Nov 2026)", () => {
  const scale = (id: string) => STYLE_PHRASES.find((p) => p.id === id)?.scale;
  it("28 for statement pieces, 36 not for them, the rest any size", () => {
    expect(STYLE_PHRASES.filter((p) => p.scale === "statement")).toHaveLength(28);
    expect(STYLE_PHRASES.filter((p) => p.scale === "small")).toHaveLength(36);
    expect(STYLE_PHRASES.filter((p) => ["keys", "home", "clothing", "gems"].includes(p.kind)).every((p) => !p.scale)).toBe(true);
  });
  it("her answers on the five doubtful ones", () => {
    expect(scale("rings-7")).toBe("statement");
    expect(scale("necklaces-21")).toBe("statement");
    expect(scale("bracelets-12")).toBe("statement");
    expect(scale("rings-21")).toBe("small");
    expect(scale("necklaces-9")).toBeUndefined();
  });
  it("a phrase she kept for any size may still hold a big-piece word — the check catches it", () => {
    // "Whether you go simple or bold" (rings-32, rings-33): the writer drops
    // "or bold" for a small piece; if it does not, Not sure asks.
    expect(bigWords(STYLE_PHRASES.find((p) => p.id === "rings-33")!.text)).toEqual(["bold"]);
    expect(scale("rings-33")).toBe("small");
  });
});

describe("rotation: phrases any piece may take, and a few for statement pieces besides", () => {
  it("six least-used of each kind that are not statement-only, then three statement-only", () => {
    const first = pickPhrases({});
    const rings = first.filter((p) => p.kind === "rings");
    expect(rings.map((p) => p.id)).toEqual([
      "rings-2", "rings-4", "rings-5", "rings-6", "rings-8", "rings-11",
      "rings-1", "rings-3", "rings-7",
    ]);
    expect(first.filter((p) => p.kind === "general").map((p) => p.scale)).toContain("statement");
    expect(first.length).toBeLessThanOrEqual(8 * PER_KIND + 5 * STATEMENT_PER_KIND + 8);
    expect(phrasesSchema.safeParse(first).success).toBe(true);
    expect(phrasesSchema.parse(first).find((p) => p.id === "rings-1")?.scale).toBe("statement");
  });
  it("statement-only phrases never crowd out the rest, used or not", () => {
    const uses = Object.fromEntries(STYLE_PHRASES.filter((p) => p.scale !== "statement").map((p, i) => [p.id, i + 1]));
    const rings = pickPhrases(uses).filter((p) => p.kind === "rings");
    expect(rings.filter((p) => p.scale !== "statement")).toHaveLength(PER_KIND);
  });
  it("the model reads the mark beside each phrase", () => {
    const [block] = phraseBlocks(pickPhrases({})) as { type: "text"; text: string }[];
    expect(block.text).toContain("[rings-1] (rings, statement pieces only)");
    expect(block.text).toContain("[rings-11] (rings, not for statement pieces)");
    expect(block.text).toContain("[rings-2] (rings) ");
    expect(block.text).toContain('opens the description ONLY when "statement" is "yes"');
  });
});

describe("the writer answers statement before the title", () => {
  it("in the answer form, before the title, required", () => {
    const order = Object.keys(AI_LISTING_SCHEMA.properties);
    expect(order.indexOf("statement")).toBeLessThan(order.indexOf("title"));
    expect(FACTS_BEFORE_TITLE).toContain("statement");
    expect(AI_LISTING_SCHEMA.required).toContain("statement");
  });
  it("the rules carry her thresholds, measured only, and never in the title", () => {
    const p = buildProfiledAnalysisPrompt("auto");
    expect(p).toContain("STATEMENT PIECES");
    expect(p).toContain("decided ONLY by a MEASUREMENT");
    expect(p).toContain('a single stone or pearl 3/8" (1 cm) or larger');
    expect(p).toContain('a chain 3/8" (1 cm) or wider — a 6 mm chain is not');
    expect(p).toContain('earrings without a big stone at least 2" (5.1 cm) long AND at least 1/2" (1.3 cm) wide');
    expect(p).toContain('a pendant without a big stone 1.5" (3.8 cm) or longer');
    expect(p).toContain("The word \"Statement\" is NEVER in the title");
    expect(p).toContain("statement, bold, chunky, oversized and massive appear NOWHERE");
  });
  it("its answer is tidied and kept with the listing", () => {
    expect(statementFromAnalysis({ answer: "YES", measure: " ruler, photo 4 " })).toEqual({ answer: "yes", measure: "ruler, photo 4" });
    expect(statementFromAnalysis({ answer: "maybe" })).toBeUndefined();
    expect(statementFromAnalysis(undefined)).toBeUndefined();
    expect(parseListing(listing({ statement: { answer: "unsure", measure: "" } })).statement?.answer).toBe("unsure");
  });
});

describe("the program's guarantees", () => {
  it('"Statement" never in a jewellery title, except inside the brand', () => {
    expect(statementOutOfTitle("Gold Tone Statement Bib Necklace 18in")).toBe("Gold Tone Bib Necklace 18in");
    expect(statementOutOfTitle("Statement Co Gold Ring", "Statement Co")).toBe("Statement Co Gold Ring");
  });
  it("not a statement piece: no Statement in Style, no big-piece tag", () => {
    expect(withoutStatementStyle({ Style: "Pendant | Statement" })).toEqual({ Style: "Pendant" });
    expect(withoutStatementStyle({ Style: "Statement" })).toEqual({});
    const tags = statementTags(
      listing({
        statement: { answer: "no", measure: "ruler: pendant 0.75 in" },
        hashtags: ["#heartnecklace", "#chunkynecklace", "#romantic"],
        etsy_tags: ["statement necklace", "bold heart", "gift for her"],
      }),
    );
    expect(tags.hashtags).toEqual(["#heartnecklace", "#romantic"]);
    expect(tags.etsy_tags).toEqual(["gift for her"]);
  });
  it("a statement piece: its statement hashtag and Etsy tag", () => {
    const tags = statementTags(listing({ statement: { answer: "yes", measure: "ruler: pendant 2 in" } }));
    expect(tags.hashtags).toEqual(["#heartnecklace", "#statementnecklace", "#romantic", "#minimalist", "#cottagecore"]);
    expect(tags.etsy_tags).toEqual(["heart necklace", "silver pendant", "gift for her", "statement necklace"]);
    const ring = statementTags(listing({ statement: { answer: "yes", measure: "" }, item_type: "Cocktail Ring", title: "Ring", hashtags: ["#cocktailring"] }));
    expect(ring.hashtags).toEqual(["#cocktailring", "#statementring"]);
  });
  it("not jewellery, or written before the rule: nothing changes", () => {
    const old = listing();
    expect(statementTags(old)).toEqual({ hashtags: old.hashtags, etsy_tags: old.etsy_tags });
    const tee = listing({ statement: { answer: "not_jewelry", measure: "" }, description: "T\n\nA bold print tee." });
    expect(statementDoubt(tee)).toBeNull();
  });
  it("Prepare: Style Statement only for a statement piece, from eBay's own list", () => {
    const meta = [{ name: "Style", values: ["Pendant", "Statement", "Choker"], cardinality: "MULTI" }];
    const yes = { Style: ["Pendant"] };
    expect(applyStatementStyle(yes, meta, { statement: { answer: "yes", measure: "" } })).toBe(true);
    expect(yes.Style).toEqual(["Pendant", "Statement"]);
    const no = { Style: ["Pendant", "Statement"] };
    expect(applyStatementStyle(no, meta, { statement: { answer: "unsure", measure: "" } })).toBe(true);
    expect(no.Style).toEqual(["Pendant"]);
    const old = { Style: ["Statement"] };
    expect(applyStatementStyle(old, meta, {})).toBe(false);
    expect(old.Style).toEqual(["Statement"]);
  });
});

describe('"Statement? Yes / No" in Not sure — free, no AI', () => {
  it("nothing measures a piece that may be big", () => {
    const d = statementDoubt(listing({ statement: { answer: "unsure", measure: "" } }));
    expect(d?.field).toBe("Statement");
    expect(d?.options).toEqual(["Yes", "No"]);
    expect(d?.why).toContain("nothing measures it");
  });
  it("the text speaks of a big piece no measurement shows", () => {
    const l = listing({
      statement: { answer: "no", measure: "" },
      description: "T\n\nJust throw on this bold, chunky necklace.\n\nBrand: X",
      style_phrase_id: "necklaces-2",
    });
    const d = statementDoubt(l)!;
    expect(d.why).toContain('"bold", "chunky"');
    expect(d.why).toContain("one of your phrases for big pieces");
    expect(allDoubts(l).map((x) => x.field)).toContain("Statement");
  });
  it("a small piece with plain words, a statement piece, or a settled one: no question", () => {
    expect(statementDoubt(listing({ statement: { answer: "no", measure: "" } }))).toBeNull();
    expect(statementDoubt(listing({ statement: { answer: "yes", measure: "" }, description: "T\n\nBold!" }))).toBeNull();
    const settled = listing({ statement: { answer: "unsure", measure: "" }, doubts_resolved: ["Statement"] });
    expect(allDoubts(settled).map((x) => x.field)).not.toContain("Statement");
  });
  it("Yes: Style and the tags at once, no text update", () => {
    const style = { values: ["Pendant", "Statement"], cardinality: "MULTI" as const };
    const r = settleStatement(listing({ statement: { answer: "unsure", measure: "" }, item_specifics: { Style: "Pendant" } }), true, style);
    expect(r.facts).toBe("");
    expect(r.patch.statement).toEqual({ answer: "yes", measure: "the seller" });
    expect(r.patch.item_specifics?.Style).toBe("Pendant | Statement");
    expect(r.patch.hashtags).toContain("#statementnecklace");
    expect(r.changed).toEqual(["Statement: Yes", "Style: Statement added", "Tags"]);
  });
  it("No: Style and tags cleaned; the text update only when big-piece words are in it", () => {
    const clean = settleStatement(listing({ statement: { answer: "unsure", measure: "" } }), false);
    expect(clean.facts).toBe("");
    expect(clean.patch.item_specifics?.Style).toBe("Pendant");
    const wordy = settleStatement(
      listing({ statement: { answer: "unsure", measure: "" }, description: "T\n\nA chunky look.\n\nBrand: X" }),
      false,
    );
    expect(wordy.facts).toContain("NOT a statement piece");
  });
  it("keeps the tags as first written in step, so her own tag edits stay hers", () => {
    const l = listing({
      statement: { answer: "unsure", measure: "" },
      hashtags: ["#heartnecklace", "#boldheart", "#mine"],
      hashtags_original: ["#heartnecklace", "#boldheart"],
    });
    const r = settleStatement(l, false);
    expect(r.patch.hashtags).toEqual(["#heartnecklace", "#mine"]);
    expect(r.patch.hashtags_original).toEqual(["#heartnecklace"]);
  });
});

describe("Update with notes and the online measurements settle it too", () => {
  it("the text update knows the thresholds and the piece's answer", () => {
    expect(REVISE_SCHEMA.required).toContain("statement");
    expect(REVISE_RULES).toContain('a pendant without a big stone 1.5" (3.8 cm) or longer');
    expect(REVISE_RULES).toContain('The word "Statement" is never in the title');
    expect(reviseMessage(listing({ statement: { answer: "unsure", measure: "" } }), "Pendant 2 in")).toContain('"statement": "unsure"');
  });
  it("a measurement makes it a statement piece: answer, tags; never the word in the title", () => {
    const l = listing({ statement: { answer: "unsure", measure: "" }, item_specifics: { Style: "Pendant" } });
    const { patch, changed } = applyRevision(l, {
      title: "Sterling Silver Statement Heart Pendant Necklace 18in",
      description: "x\n\nBody",
      statement: "yes",
    });
    expect(patch.statement?.answer).toBe("yes");
    // The title stays as it was: the word came out before it was compared.
    expect(patch.title).toBeUndefined();
    expect(patch.description?.split("\n")[0]).toBe("Sterling Silver Heart Pendant Necklace 18in");
    expect(patch.hashtags).toContain("#statementnecklace");
    expect(changed).toContain("Statement: Yes");
  });
  it("measured small: Statement out of Style and the tags", () => {
    const l = listing({ statement: { answer: "unsure", measure: "" }, hashtags: ["#heartnecklace", "#statementnecklace"] });
    const { patch } = applyRevision(l, { title: l.title, description: l.description, statement: "no" });
    expect(patch.statement?.answer).toBe("no");
    expect(patch.item_specifics?.Style).toBe("Pendant");
    expect(patch.hashtags).toEqual(["#heartnecklace"]);
  });
  it("a listing from before the rule is left as it was", () => {
    const l = listing();
    const { patch } = applyRevision(l, { title: l.title, description: l.description, statement: "unchanged" });
    expect(patch.statement).toBeUndefined();
    expect(patch.item_specifics).toBeUndefined();
    expect(patch.hashtags).toBeUndefined();
  });
});
