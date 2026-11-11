"use client";
// The drafts, one at a time, full screen (the seller's design, 11 Nov 2026):
//   row 1 — ← back, "Draft 3 of 24", ‹ Previous · Next ›   (navigation only)
//   row 2 — Post now / Schedule (date, time in Pacific time) and the big green
//           Post to eBay — apart from Next, so the two are never confused
//   bar   — Check before posting: what stops this draft, each a link to its field
import { useEffect, useMemo, useState } from "react";
import { draftIssueItems, draftIssues } from "@/lib/client-review";
import { downloadFile, listingsToCsv, listingsToJson } from "@/lib/export";
import { showPacific } from "@/lib/pacific-time";
import type { EbayAccountInfo, ItemGroup, ListingResult, Photo } from "@/lib/types";
import { DraftCard, fieldAnchor } from "./DraftCard";

interface Props {
  groups: ItemGroup[];
  photoById: (id: string) => Photo | undefined;
  ebayConnected: boolean;
  ebayAccount?: EbayAccountInfo;
  onGroupEdit: (id: string, patch: Partial<ItemGroup>) => void;
  onEdit: (groupId: string, patch: Partial<ListingResult>) => void;
  onRenameSku: (groupId: string, sku: string) => void;
  onRetry: (groupId: string) => void;
  onPost: (groupId: string) => void;
  onPostAll: () => void;
  onBack: () => void;
}

/** Jump to a field, light it up for a moment, and put the cursor in it. */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1800);
  const input = el.querySelector<HTMLElement>("input, select, textarea");
  setTimeout(() => input?.focus({ preventScroll: true }), 350);
}

export function DraftScreen(p: Props) {
  const { groups } = p;
  // Open on the first draft not yet posted.
  const [index, setIndex] = useState(() => {
    const i = groups.findIndex((g) => g.postStatus !== "posted");
    return i < 0 ? 0 : i;
  });
  useEffect(() => {
    if (index > groups.length - 1) setIndex(Math.max(0, groups.length - 1));
  }, [groups.length, index]);
  const g = groups[Math.min(index, groups.length - 1)];

  const issues = useMemo(() => (g ? draftIssueItems(g) : []), [g]);
  const posted = groups.filter((x) => x.postStatus === "posted").length;
  const readyToPost = groups.filter((x) => x.status === "done" && x.postStatus !== "posted" && !draftIssues(x).length).length;
  const posting = groups.some((x) => x.postStatus === "posting");
  const done = groups.filter((x) => x.status === "done").length;

  if (!g) return null;
  const go = (i: number) => {
    setIndex(i);
    window.scrollTo({ top: 0 });
  };
  const scheduling = g.scheduleStart === true;
  const [date, time] = (g.scheduleAt ?? "T").split("T");
  const setWhen = (d: string, t: string) => p.onGroupEdit(g.id, { scheduleAt: d && t ? `${d}T${t}` : d ? `${d}T` : "" });

  return (
    <section className="draft-screen" aria-label="Your listings">
      <div className="draft-nav">
        <button type="button" className="btn" onClick={p.onBack}>
          ← Back to items
        </button>
        <span className="hint">
          Draft {index + 1} of {groups.length}
          {posted ? ` · ${posted} posted` : ""}
          {done < groups.length ? ` · ${groups.length - done} not written yet` : ""}
        </span>
        <span className="grow" />
        <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}>
          ‹ Previous
        </button>
        <button type="button" className="btn" disabled={index >= groups.length - 1} onClick={() => go(index + 1)}>
          Next ›
        </button>
      </div>

      {g.postStatus === "posted" ? (
        <div className="draft-post posted">
          <span>
            {g.scheduledFor
              ? `✅ Scheduled on eBay — goes live ${showPacific(g.scheduledFor)}.`
              : `✅ Posted to eBay${g.postedAccount ? ` (${g.postedAccount})` : ""}.`}{" "}
            {g.listingId && (
              <a href={`https://www.ebay.com/itm/${g.listingId}`} target="_blank" rel="noopener noreferrer">
                View listing ↗
              </a>
            )}
          </span>
          {(g.postWarnings ?? []).map((w) => (
            <span key={w} className="hint warn">
              ⚠️ {w}
            </span>
          ))}
        </div>
      ) : p.ebayConnected ? (
        <div className="draft-post">
          {p.ebayAccount?.label && (
            <span className="hint">
              Posts to <strong>{p.ebayAccount.label}</strong>
            </span>
          )}
          <span className="grow" />
          <div className="when">
            <label>
              <input
                type="radio"
                name={`when-${g.id}`}
                checked={!scheduling}
                onChange={() => p.onGroupEdit(g.id, { scheduleStart: false })}
              />{" "}
              Post now
            </label>
            <label>
              <input
                type="radio"
                name={`when-${g.id}`}
                checked={scheduling}
                onChange={() => p.onGroupEdit(g.id, { scheduleStart: true })}
              />{" "}
              Schedule
            </label>
            {scheduling && (
              <>
                <input type="date" aria-label="Start date (Pacific time)" value={date ?? ""} onChange={(e) => setWhen(e.target.value, time ?? "")} />
                <input type="time" aria-label="Start time (Pacific time)" value={time ?? ""} onChange={(e) => setWhen(date ?? "", e.target.value)} />
                <span className="hint">PST · up to 3 weeks ahead</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="btn-post"
            onClick={() => p.onPost(g.id)}
            disabled={g.status !== "done" || g.postStatus === "posting" || issues.length > 0 || (scheduling && !/T\d\d:\d\d$/.test(g.scheduleAt ?? ""))}
          >
            {g.postStatus === "posting" ? (
              <>
                <span className="spinner" aria-hidden="true" /> Posting…
              </>
            ) : scheduling ? (
              "Schedule on eBay"
            ) : (
              "Post to eBay"
            )}
          </button>
          {g.postStatus === "error" && g.postError && <p className="note-error">⚠️ {g.postError}</p>}
        </div>
      ) : (
        <div className="draft-post">
          <span className="hint">Connect eBay at the top of the page to post.</span>
        </div>
      )}

      {g.status === "done" && g.postStatus !== "posted" && (
        <div className={`check-bar${issues.length ? "" : " ready"}`}>
          {issues.length ? (
            <>
              <b>
                Check before posting · {issues.length} problem{issues.length > 1 ? "s" : ""}
              </b>
              <ul>
                {issues.map((i) => (
                  <li key={i.text}>
                    {i.field ? (
                      <a
                        href={`#${fieldAnchor(g.id, i.field)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          jumpTo(fieldAnchor(g.id, i.field!));
                        }}
                      >
                        {i.text}
                      </a>
                    ) : (
                      i.text
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <b>✓ Ready to post</b>
          )}
        </div>
      )}

      <DraftCard
        key={g.id}
        group={g}
        photoById={p.photoById}
        accountKey={p.ebayAccount?.key ?? 0}
        onGroupEdit={p.onGroupEdit}
        onEdit={p.onEdit}
        onRenameSku={p.onRenameSku}
        onRetry={p.onRetry}
      />

      <div className="draft-footer">
        <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}>
          ‹ Previous
        </button>
        <button type="button" className="btn" disabled={index >= groups.length - 1} onClick={() => go(index + 1)}>
          Next ›
        </button>
        <span className="grow" />
        {p.ebayConnected && readyToPost > 1 && (
          <button type="button" className="btn" disabled={posting} onClick={p.onPostAll}>
            Post all {readyToPost} ready drafts
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={done === 0}
          onClick={() => downloadFile("ebay-listings.csv", listingsToCsv(groups), "text/csv")}
        >
          ⬇️ Spreadsheet (CSV)
        </button>
        <button
          type="button"
          className="btn"
          disabled={done === 0}
          onClick={() => downloadFile("ebay-listings.json", listingsToJson(groups), "application/json")}
        >
          ⬇️ All drafts (JSON)
        </button>
      </div>
    </section>
  );
}
