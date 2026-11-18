"use client";
import { useEffect, useState } from "react";
import { ITEM_KINDS, KIND_LABEL, MAX_RULES } from "@/lib/learn-diff";
import {
  LISTING_MEMORY_EVENT,
  forgetCategory,
  forgetRule,
  loadCategoryMemory,
  loadRules,
  type CategoryMemory,
  type StoredRule,
} from "@/lib/listing-memory";

const FIELD: Record<StoredRule["field"], string> = {
  title: "Title",
  description: "Description",
  item_specifics: "Item specifics",
};

/**
 * "What I learned" (18 Nov 2026): the rules the program made from the
 * seller's corrections, by kind of item, and the categories she chose — all
 * of it goes along with new listings of that kind. A wrong one is removed here.
 */
export function ListingMemoryPanel() {
  const [rules, setRules] = useState<StoredRule[]>([]);
  const [categories, setCategories] = useState<CategoryMemory[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      void Promise.all([loadRules(), loadCategoryMemory()])
        .then(([r, c]) => {
          setRules(r);
          setCategories(c);
        })
        .catch(() => setError("What was learned could not be read on this device."));
    load();
    window.addEventListener(LISTING_MEMORY_EVENT, load);
    return () => window.removeEventListener(LISTING_MEMORY_EVENT, load);
  }, []);

  const forget = (key: string, run: () => Promise<void>) => (
    <span className="history-actions">
      {confirming === key ? (
        <>
          <span>Forget this?</span>
          <button
            type="button"
            className="history-danger"
            onClick={() => {
              setConfirming(null);
              void run().catch((e) => setError((e as Error).message));
            }}
          >
            Yes, forget it
          </button>
          <button type="button" onClick={() => setConfirming(null)}>
            Keep it
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(key)}>
          Forget
        </button>
      )}
    </span>
  );

  return (
    <section className="history-panel" aria-label="What the program learned from you">
      <details>
        <summary>🧠 What I learned from your corrections — {rules.length + categories.length}</summary>
        <p className="history-hint">
          When you post a card or save it to History, what you changed in the
          title, the description, the item specifics and the category is
          learned here — for the same kind of item only. The newest {MAX_RULES}{" "}
          rules go along with every new listing. Forget any that are wrong.
        </p>
        {error && (
          <p className="history-error" role="alert">
            {error}
          </p>
        )}
        {!rules.length && !categories.length && (
          <p className="history-hint">
            Nothing yet. Fix a draft the way you like it, then post it or save
            it to History.
          </p>
        )}
        {ITEM_KINDS.map((kind) => {
          const mine = rules.filter((r) => r.kind === kind);
          const cats = categories.filter((c) => c.kind === kind);
          if (!mine.length && !cats.length) return null;
          return (
            <div key={kind}>
              <h4 className="memory-kind">{KIND_LABEL[kind]}</h4>
              <ul className="history-list">
                {mine.map((r) => (
                  <li key={r.id} className="history-item">
                    <div className="history-text">
                      <strong>
                        {FIELD[r.field]}: {r.rule}
                      </strong>
                      <span className="history-meta">
                        from “{r.item}” · learned {new Date(r.savedAt).toLocaleDateString()}
                      </span>
                      {forget(`rule:${r.id}`, () => forgetRule(r.id))}
                    </div>
                  </li>
                ))}
                {cats.map((c) => (
                  <li key={`cat:${c.itemType}`} className="history-item">
                    <div className="history-text">
                      <strong>
                        Category: “{c.itemType}” → {c.categoryPath.split(">").pop()?.trim() || c.categoryId}
                      </strong>
                      <span className="history-meta">
                        {c.categoryPath} · learned {new Date(c.savedAt).toLocaleDateString()}
                      </span>
                      {forget(`cat:${c.itemType}`, () => forgetCategory(c.itemType))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </details>
    </section>
  );
}
