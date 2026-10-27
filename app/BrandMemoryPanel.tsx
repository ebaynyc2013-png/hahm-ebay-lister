"use client";
import { useEffect, useState } from "react";
import {
  BRAND_MEMORY_EVENT,
  MAX_REFERENCES,
  forgetBrandMark,
  loadBrandMarks,
  type BrandMark,
} from "@/lib/brand-memory";

/**
 * The marks the program has learned from the seller — what it will compare new
 * pieces against. A wrong one can be removed here, after an in-page check.
 */
export function BrandMemoryPanel() {
  const [marks, setMarks] = useState<BrandMark[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      void loadBrandMarks()
        .then(setMarks)
        .catch(() => setError("The learned marks could not be read on this device."));
    load();
    window.addEventListener(BRAND_MEMORY_EVENT, load);
    return () => window.removeEventListener(BRAND_MEMORY_EVENT, load);
  }, []);

  if (!marks.length && !error) return null;
  return (
    <section className="history-panel" aria-label="Learned maker's marks">
      <details>
        <summary>
          🧠 Maker&rsquo;s marks learned from you — {marks.length}
        </summary>
        <p className="history-hint">
          Each time you confirm or pick a brand for a piece with a maker&rsquo;s
          mark, the mark is kept here. The newest {MAX_REFERENCES} go along with
          every new listing, so the AI can compare. Remove any that are wrong.
        </p>
        {error && (
          <p className="history-error" role="alert">
            {error}
          </p>
        )}
        <ul className="history-list">
          {marks.map((m) => (
            <li key={m.id} className="history-item">
              {m.image ? (
                <img
                  className="history-thumb"
                  src={`data:${m.image.mediaType};base64,${m.image.data}`}
                  alt=""
                />
              ) : (
                <span className="history-thumb" aria-hidden="true" />
              )}
              <div className="history-text">
                <strong>{m.brand}</strong>
                <span className="history-meta">
                  {m.marks.join("; ")}
                  {m.itemType ? ` · ${m.itemType}` : ""} · learned{" "}
                  {new Date(m.savedAt).toLocaleDateString()}
                </span>
                {confirming === m.id ? (
                  <span className="history-actions">
                    <span>Forget this mark?</span>
                    <button
                      type="button"
                      className="history-danger"
                      onClick={() => {
                        setConfirming(null);
                        void forgetBrandMark(m.id).catch((e) =>
                          setError((e as Error).message),
                        );
                      }}
                    >
                      Yes, forget it
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}>
                      Keep it
                    </button>
                  </span>
                ) : (
                  <span className="history-actions">
                    <button type="button" onClick={() => setConfirming(m.id)}>
                      Forget
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
