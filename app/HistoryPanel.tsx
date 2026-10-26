"use client";
import { useState } from "react";
import type { HistoryEntry } from "@/lib/history-store";

interface Props {
  entries: HistoryEntry[];
  /** The card being returned right now, if any. */
  busyId?: string;
  error?: string;
  onReturn: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
}

/**
 * Cards that have left the work screen. Each one can come back to work with
 * its fields and photos, or be removed for good after a second, in-page
 * confirmation (a browser confirm() dialog would freeze automated sessions).
 */
export function HistoryPanel({ entries, busyId, error, onReturn, onDelete }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!entries.length && !error) return null;
  return (
    <section className="history-panel" aria-label="History">
      <details>
        <summary>
          🗂 History — {entries.length} saved{" "}
          {entries.length === 1 ? "card" : "cards"}
        </summary>
        <p className="history-hint">
          Every written listing is kept here on this computer after it leaves
          the work screen. Cards not yet on eBay keep their full photos, so you
          can return them to work, finish and publish them.
        </p>
        {error && (
          <p className="history-error" role="alert">
            {error}
          </p>
        )}
        <ul className="history-list">
          {entries.map((e) => (
            <li key={e.id} className="history-item">
              {e.thumb ? (
                <img className="history-thumb" src={e.thumb} alt="" />
              ) : (
                <span className="history-thumb" aria-hidden="true" />
              )}
              <div className="history-text">
                <strong>{e.group.listing?.title || e.group.name}</strong>
                <span className="history-meta">
                  {e.published ? (
                    <>
                      ✅ Published on eBay
                      {e.group.listingId && (
                        <>
                          {" · "}
                          <a
                            href={`https://www.ebay.com/itm/${e.group.listingId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            open on eBay
                          </a>
                        </>
                      )}
                    </>
                  ) : (
                    "Not published yet"
                  )}
                  {" · saved "}
                  {new Date(e.savedAt).toLocaleString()}
                </span>
                {confirming === e.id ? (
                  <span className="history-actions">
                    <span>Delete this card from History for good?</span>
                    <button
                      type="button"
                      className="history-danger"
                      onClick={() => {
                        setConfirming(null);
                        onDelete(e);
                      }}
                    >
                      Yes, delete
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}>
                      Keep it
                    </button>
                  </span>
                ) : (
                  <span className="history-actions">
                    <button
                      type="button"
                      className="history-return"
                      disabled={busyId === e.id}
                      onClick={() => onReturn(e)}
                    >
                      {busyId === e.id ? "Returning…" : "↩ Return to work"}
                    </button>
                    <button type="button" onClick={() => setConfirming(e.id)}>
                      Delete
                    </button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
