"use client";
import { useEffect, useState } from "react";
import { CopyButton } from "./CopyButton";
import {
  ETSY_TAG_LIMIT,
  ETSY_TAG_MAX_CHARS,
  MERCARI_HASHTAGS,
  etsyTagLine,
  hashtagLine,
} from "@/lib/marketplace-tags";
import { lessonFromEdit, rememberTagLesson } from "@/lib/tag-memory";
import type { ListingResult } from "@/lib/types";

const parseHashtags = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t && t !== "#")
    .map((t) => (t.startsWith("#") ? t : `#${t}`));

const parseEtsy = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/** Tags Etsy would refuse when pasted: too long, a character it does not take, or a repeat. */
function etsyProblems(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const k = t.toLowerCase();
    if (t.length > ETSY_TAG_MAX_CHARS) out.push(`"${t}" is over ${ETSY_TAG_MAX_CHARS} characters`);
    else if (!/^[\p{L}\p{N}' _-]+$/u.test(t)) out.push(`"${t}" has a character Etsy refuses`);
    else if (seen.has(k)) out.push(`"${t}" twice`);
    seen.add(k);
  }
  if (tags.length > ETSY_TAG_LIMIT) out.push(`${tags.length} tags — Etsy takes ${ETSY_TAG_LIMIT}`);
  return out;
}

/**
 * Hashtags for Depop, Mercari and Poshmark and the 13 Etsy tags — never sent
 * to eBay. The seller can change them; "Remember" keeps what she changed, and
 * the next listings follow it (tag-memory.ts).
 */
export function OtherShopsTags({
  listing,
  onEdit,
}: {
  listing: ListingResult;
  onEdit: (patch: Partial<ListingResult>) => void;
}) {
  const hashtags = listing.hashtags ?? [];
  const etsy = listing.etsy_tags ?? [];
  const [hashText, setHashText] = useState(hashtagLine(hashtags));
  const [etsyText, setEtsyText] = useState(etsyTagLine(etsy));
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");

  // A new analysis or a Re-analyze replaces the tags: show the new ones.
  const hashKey = hashtagLine(hashtags);
  const etsyKey = etsyTagLine(etsy);
  useEffect(() => setHashText(hashKey), [hashKey]);
  useEffect(() => setEtsyText(etsyKey), [etsyKey]);

  const lessons = [
    lessonFromEdit("hashtags", listing.hashtags_original ?? hashtags, hashtags, listing),
    lessonFromEdit("etsy", listing.etsy_tags_original ?? etsy, etsy, listing),
  ].filter((l): l is NonNullable<typeof l> => l !== null);
  const problems = etsyProblems(etsy);

  async function remember() {
    setState("saving");
    try {
      for (const l of lessons) await rememberTagLesson(l);
      onEdit({ hashtags_original: [...hashtags], etsy_tags_original: [...etsy] });
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="result-field other-shops" aria-label="Tags for other shops">
      <label>Tags for Depop, Mercari, Poshmark and Etsy · not sent to eBay</label>
      <div className="tag-line">
        <span className="tag-k">
          Depop / Mercari / Poshmark
          <small> · Mercari takes the first {MERCARI_HASHTAGS}</small>
        </span>
        <textarea
          aria-label="Hashtags for Depop, Mercari and Poshmark"
          className="tag-v"
          rows={2}
          value={hashText}
          onChange={(e) => {
            setHashText(e.target.value);
            setState("");
          }}
          onBlur={() => onEdit({ hashtags: parseHashtags(hashText) })}
        />
        <CopyButton text={hashtagLine(parseHashtags(hashText))} label="hashtags" />
      </div>
      <div className="tag-line">
        <span className="tag-k">
          Etsy · {parseEtsy(etsyText).length} of {ETSY_TAG_LIMIT}
        </span>
        <textarea
          aria-label="Etsy tags"
          className="tag-v"
          rows={3}
          value={etsyText}
          onChange={(e) => {
            setEtsyText(e.target.value);
            setState("");
          }}
          onBlur={() => onEdit({ etsy_tags: parseEtsy(etsyText) })}
        />
        {!!problems.length && (
          <p className="field-note warn" role="alert">
            ⚠️ Etsy may refuse: {problems.join("; ")}.
          </p>
        )}
        <CopyButton text={etsyTagLine(parseEtsy(etsyText))} label="Etsy tags" />
      </div>
      {!!lessons.length && state !== "saved" && (
        <div className="tag-remember">
          <button type="button" className="btn btn-ghost" onClick={remember} disabled={state === "saving"}>
            🧠 Remember my changes
          </button>
          <span className="field-note">
            The next listings will follow them. You can remove a correction at the bottom of the page.
          </span>
        </div>
      )}
      {state === "saved" && (
        <p className="field-note">✓ Remembered — the next listings will follow your changes.</p>
      )}
      {state === "error" && (
        <p className="field-note warn" role="alert">
          ⚠️ Could not remember the changes on this device.
        </p>
      )}
    </section>
  );
}
