"use client";
import { useEffect, useState } from "react";
import {
  MAX_LESSONS,
  TAG_MEMORY_EVENT,
  describeLesson,
  forgetTagLesson,
  loadTagLessons,
  type TagLesson,
} from "@/lib/tag-memory";

/**
 * The tag corrections the program has learned from the seller — what goes
 * along with every new listing as her rules. A wrong one can be removed here.
 */
export function TagMemoryPanel() {
  const [lessons, setLessons] = useState<TagLesson[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      void loadTagLessons()
        .then(setLessons)
        .catch(() => setError("The learned corrections could not be read on this device."));
    load();
    window.addEventListener(TAG_MEMORY_EVENT, load);
    return () => window.removeEventListener(TAG_MEMORY_EVENT, load);
  }, []);

  if (!lessons.length && !error) return null;
  return (
    <section className="history-panel" aria-label="Learned tag corrections">
      <details>
        <summary>🏷️ Tag corrections learned from you — {lessons.length}</summary>
        <p className="history-hint">
          Each time you change the hashtags or Etsy tags on a card and press
          Remember, your change is kept here. The newest {MAX_LESSONS} go along
          with every new listing as your rules. Remove any that are wrong.
        </p>
        {error && (
          <p className="history-error" role="alert">
            {error}
          </p>
        )}
        <ul className="history-list">
          {lessons.map((l) => (
            <li key={l.id} className="history-item">
              <div className="history-text">
                <strong>{l.item}</strong>
                <span className="history-meta">
                  {describeLesson({ ...l, title: undefined }).replace(`${l.item} — `, "")} · learned{" "}
                  {new Date(l.savedAt).toLocaleDateString()}
                </span>
                {confirming === l.id ? (
                  <span className="history-actions">
                    <span>Forget this correction?</span>
                    <button
                      type="button"
                      className="history-danger"
                      onClick={() => {
                        setConfirming(null);
                        void forgetTagLesson(l.id).catch((e) => setError((e as Error).message));
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
                    <button type="button" onClick={() => setConfirming(l.id)}>
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
