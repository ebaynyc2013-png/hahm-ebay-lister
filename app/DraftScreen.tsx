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
import { allDoubts } from "@/lib/listing-mismatch";
import { requestText } from "@/lib/text-dialog";
import { reviseListing, showCost } from "./reviseClient";
import { hostOf, type LookupLink, type ProductLookup } from "@/lib/product-lookup";

interface Props {
  groups: ItemGroup[];
  photoById: (id: string) => Photo | undefined;
  ebayConnected: boolean;
  ebayAccount?: EbayAccountInfo;
  onGroupEdit: (id: string, patch: Partial<ItemGroup>) => void;
  onEdit: (groupId: string, patch: Partial<ListingResult>) => void;
  onRenameSku: (groupId: string, sku: string) => void;
  onRetry: (groupId: string) => void;
  onAddPhotos: (groupId: string, files: FileList | null) => Promise<number>;
  photoLimit: number;
  onPost: (groupId: string) => void;
  onPostAll: () => void;
  onSaveHistory: () => Promise<boolean>;
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

      {g.status === "done" && g.lookup && g.lookup.status !== "searching" && g.postStatus !== "posted" && (
        <LookupBox lookup={g.lookup} />
      )}

      {g.status === "done" && g.listing && g.postStatus !== "posted" && (
        <DoubtsBox key={`doubts-${g.id}`} group={g} onEdit={p.onEdit} />
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
        onAddPhotos={p.onAddPhotos}
        photoLimit={p.photoLimit}
      />

      <SaveToHistory key={`save-${g.id}`} onSave={p.onSaveHistory} />

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

/**
 * What the writer was not sure of, and where the title, the description and
 * the item specifics disagree — at the top, with a button for each choice
 * (12 Nov 2026). The first choice is the main one (Metal); a second is named
 * in the title and the description. Apply corrects the listing everywhere,
 * text only, a few cents.
 */
function DoubtsBox({
  group: g,
  onEdit,
}: {
  group: ItemGroup;
  onEdit: (groupId: string, patch: Partial<ListingResult>) => void;
}) {
  const l = g.listing!;
  const doubts = allDoubts(l);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  if (!doubts.length && !msg) return null;

  const toggle = (field: string, option: string) =>
    setPicked((prev) => {
      const now = prev[field] ?? [];
      return { ...prev, [field]: now.includes(option) ? now.filter((o) => o !== option) : [...now, option] };
    });
  const other = async (field: string) => {
    const typed = (await requestText(`${field} — type the right value`))?.trim();
    if (typed) setPicked((prev) => ({ ...prev, [field]: [...(prev[field] ?? []), typed] }));
  };
  const apply = async (field: string) => {
    const choice = picked[field] ?? [];
    if (!choice.length) return;
    const facts =
      choice.length === 1
        ? `${field}: ${choice[0]}. Use exactly this in the item specifics, the title and the description.`
        : `${field}: ${choice[0]} is the main one — it goes in ${field}${/metal/i.test(field) ? " and Base Metal" : ""}. The item also has ${choice
            .slice(1)
            .join(" and ")} — name it in the title and the description too. Use exactly these words.`;
    setBusy(field);
    setMsg(null);
    try {
      const r = await reviseListing(l, facts);
      onEdit(g.id, {
        ...r.patch,
        doubts: (l.doubts ?? []).filter((d) => d.field.toLowerCase() !== field.toLowerCase()),
        doubts_resolved: [...new Set([...(l.doubts_resolved ?? []), field])],
      });
      setMsg({
        text: r.changed.length
          ? `Updated: ${r.changed.join(" · ")}${r.usd ? ` · ${showCost(r.usd)}` : ""}`
          : `Nothing needed to change${r.usd ? ` · ${showCost(r.usd)}` : ""}`,
      });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="doubts-box">
      {doubts.map((d) => {
        const sel = picked[d.field] ?? [];
        return (
          <div key={d.field} className="doubt">
            <span>
              <b>Not sure — {d.field}:</b> {d.why}
            </span>
            <div className="doubt-options">
              {[...d.options, ...sel.filter((o) => !d.options.includes(o))].map((o) => {
                const at = sel.indexOf(o);
                return (
                  <button
                    key={o}
                    type="button"
                    className={`btn btn-small${at >= 0 ? " picked" : ""}`}
                    aria-pressed={at >= 0}
                    disabled={Boolean(busy)}
                    onClick={() => toggle(d.field, o)}
                  >
                    {at >= 0 ? `${at + 1}. ` : ""}
                    {o}
                  </button>
                );
              })}
              <button type="button" className="btn btn-small" disabled={Boolean(busy)} onClick={() => void other(d.field)}>
                Other…
              </button>
              <button
                type="button"
                className="btn btn-small btn-apply"
                disabled={!sel.length || Boolean(busy)}
                onClick={() => void apply(d.field)}
              >
                {busy === d.field ? (
                  <>
                    <span className="spinner small" aria-hidden="true" /> Updating…
                  </>
                ) : (
                  "Apply"
                )}
              </button>
            </div>
          </div>
        );
      })}
      {msg && <p className={`hint${msg.error ? " warn" : ""}`}>{msg.text}</p>}
    </div>
  );
}

/** What the online search found, what it changed, where from (12 Nov 2026). */
function LookupBox({ lookup: r }: { lookup: ProductLookup }) {
  const links = (xs: LookupLink[] | undefined) =>
    (xs ?? []).map((x, i) => (
      <span key={x.url}>
        {i ? " · " : ""}
        <a href={x.url} target="_blank" rel="noopener noreferrer">
          {x.title || hostOf(x.url)} ↗
        </a>
      </span>
    ));
  const cost = r.usd ? ` · ${showCost(r.usd)}` : "";
  return (
    <div className={`lookup-box ${r.status}`}>
      {r.status === "found" && r.source && (
        <p>
          <b>Found online:</b>{" "}
          <a href={r.source.url} target="_blank" rel="noopener noreferrer">
            {r.product_name || r.source.title} — {r.source.site} ↗
          </a>
          {r.changed?.length ? ` · Updated: ${r.changed.join(" · ")}` : " · Nothing needed to change"}
          {cost}
        </p>
      )}
      {r.status === "similar" && (
        <p>
          <b>Not found exactly online.</b> Similar (not used): {links(r.similar)}
          {cost}
        </p>
      )}
      {r.status === "not_found" && (
        <p>
          <b>Not found online.</b>
          {cost}
        </p>
      )}
      {r.status === "error" && <p className="warn">Online search did not work: {r.error}</p>}
      {(r.resale ?? []).length > 0 && <p className="hint">On resale sites (not used): {links(r.resale)}</p>}
    </div>
  );
}

/** "Save to History" at the bottom of the draft, then "Saved ✓" (12 Nov 2026). */
function SaveToHistory({ onSave }: { onSave: () => Promise<boolean> }) {
  const [state, setState] = useState<"" | "saving" | "saved" | "failed">("");
  return (
    <div className="draft-save">
      <button
        type="button"
        className="btn"
        disabled={state === "saving"}
        onClick={async () => {
          setState("saving");
          setState((await onSave()) ? "saved" : "failed");
        }}
      >
        {state === "saving" ? (
          <>
            <span className="spinner small" aria-hidden="true" /> Saving…
          </>
        ) : (
          "Save to History"
        )}
      </button>
      {state === "saved" && <span className="saved-mark">Saved ✓</span>}
      {state === "failed" && <span className="hint warn">Not saved — check your internet.</span>}
    </div>
  );
}
