"use client";
// One draft on the new full-screen, two-half layout (the seller's design of
// 11 Nov 2026 — see claude/draft-screen-design.md in the project):
//   left  — title, photos in one row, price / cost / SKU, the whole
//           description, Re-analyze, other shops' tags, shipping 2×2;
//   right — eBay category, Brand (and the "not sure" box only when the lister
//           doubts it), Condition, every field eBay has for the category,
//           grouped Required / Recommended / Optional; empty required = amber,
//           other empty = green.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyChosenBrand, brandNeedsConfirmation, photoNumberOfMark } from "@/lib/maker-marks";
import { imageFromDataUrl, rememberBrandMark } from "@/lib/brand-memory";
import { makerSigns } from "@/lib/brand-signs";
import { DESCRIPTION_LIMIT } from "@/lib/description-format";
import { withCost } from "@/lib/sku";
import { confirmVintage } from "@/lib/vintage";
import { conditionMenuLabel, gradeChange, gradeForEbayCondition } from "@/lib/condition-sync";
import { requestText } from "@/lib/text-dialog";
import type { AspectMeta } from "@/lib/ebay/taxonomy";
import type { ItemGroup, ListingResult, Photo } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import { OtherShopsTags } from "./OtherShopsTags";
import { useDraftEbay } from "./useDraftEbay";
import { reviseListing, showCost } from "./reviseClient";

const TITLE_LIMIT = 80;
// Fields eBay calls free text but whose answer is one of eBay's own words.
const PICK_FROM_LIST = new Set(["size", "garment care"]);

// Before a category is prepared there is no eBay menu yet: the lister's grade.
const GRADES: { value: string; label: string }[] = [
  { value: "NEW_WITH_TAGS", label: "New with tags" },
  { value: "NEW_NO_TAGS", label: "New without tags" },
  { value: "EXCELLENT", label: "Pre-owned · Excellent" },
  { value: "VERY_GOOD", label: "Pre-owned · Very good" },
  { value: "GOOD", label: "Pre-owned · Good" },
  { value: "FAIR", label: "Pre-owned · Fair" },
  { value: "FOR_PARTS_OR_NOT_WORKING", label: "For parts / not working" },
];

/** The id a check-bar link jumps to. */
export const fieldAnchor = (groupId: string, field: string) =>
  `f-${groupId}-${field.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const toInput = (v: ListingResult["suggested_price"]) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n === undefined || Number.isNaN(n) ? "" : String(n);
};

interface Props {
  group: ItemGroup;
  photoById: (id: string) => Photo | undefined;
  accountKey: number;
  onGroupEdit: (id: string, patch: Partial<ItemGroup>) => void;
  onEdit: (groupId: string, patch: Partial<ListingResult>) => void;
  onRenameSku: (groupId: string, sku: string) => void;
  onRetry: (groupId: string) => void;
  onAddPhotos: (groupId: string, files: FileList | null) => Promise<number>;
  photoLimit: number;
}

export function DraftCard(props: Props) {
  const { group } = props;
  if (group.status !== "done" || !group.listing)
    return (
      <div className="draft-pending">
        {group.status === "writing" && (
          <p>
            <span className="spinner small" aria-hidden="true" />{" "}
            {group.lookup?.status === "searching" ? "Looking this item up online…" : "Writing this listing…"}
          </p>
        )}
        {group.status === "idle" && <p>Waiting to be written…</p>}
        {group.status === "error" && (
          <>
            <p className="note-error">⚠️ {group.error || "Writing this listing failed."}</p>
            <button type="button" className="btn" onClick={() => props.onRetry(group.id)}>
              ↻ Try again
            </button>
          </>
        )}
      </div>
    );
  return <DraftBody {...props} />;
}

function DraftBody({ group: g, photoById, accountKey, onGroupEdit, onEdit, onRenameSku, onRetry, onAddPhotos, photoLimit }: Props) {
  // Photos just added to this item: until she answers, ask whether to
  // re-analyze — a new photo (a tag, a mark) can change the listing.
  const [justAdded, setJustAdded] = useState(0);
  const [adding, setAdding] = useState(false);
  const addInput = useRef<HTMLInputElement>(null);
  const addPhotos = async (files: FileList | null) => {
    setAdding(true);
    const n = await onAddPhotos(g.id, files);
    setAdding(false);
    if (n) setJustAdded((x) => x + n);
    if (addInput.current) addInput.current.value = "";
  };
  const d = useDraftEbay(g, photoById, onGroupEdit, accountKey);
  const l = d.l;
  // "Update with notes": the listing corrected from what she typed, text
  // only — a few cents, not a Re-analyze (12 Nov 2026).
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const updateWithNotes = async () => {
    const notes = (g.notes ?? "").trim();
    if (!notes) return;
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const r = await reviseListing(l, notes);
      d.edit({ ...r.patch, seller_notes: notes });
      setUpdateMsg({
        text: r.changed.length
          ? `Updated: ${r.changed.join(" · ")}${r.usd ? ` · ${showCost(r.usd)}` : ""}`
          : `Nothing needed to change${r.usd ? ` · ${showCost(r.usd)}` : ""}`,
      });
    } catch (e) {
      setUpdateMsg({ text: (e as Error).message, error: true });
    } finally {
      setUpdating(false);
    }
  };
  const [zoom, setZoom] = useState<number | null>(null);
  // Drag a photo to a new place; the order is eBay's order, the first is the
  // main photo (the seller, 12 Nov 2026).
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const locked = g.postStatus === "posted" || g.postStatus === "posting";
  const a = (field: string) => fieldAnchor(g.id, field);

  // The whole description, always: the box grows with the text (no scrolling
  // inside it — the seller reads 800 characters at a glance).
  const descRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = descRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [l.description]);

  // Close the enlarged photo with Escape.
  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
      if (e.key === "ArrowRight") setZoom((z) => (z === null ? z : Math.min(z + 1, g.photoIds.length - 1)));
      if (e.key === "ArrowLeft") setZoom((z) => (z === null ? z : Math.max(z - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, g.photoIds.length]);

  // Keep a confirmed maker's mark (its words and the small photo it was seen on).
  const rememberMark = async (brand: string) => {
    if (!brand.trim() || /^unbranded$/i.test(brand.trim())) return;
    const marks = makerSigns(l.maker_marks);
    if (!marks.length) return;
    const n = marks.map(photoNumberOfMark).find((x): x is number => Boolean(x));
    const ids = g.evidencePhotoIds ?? g.analysisPhotoIds ?? g.photoIds;
    const photo = n ? photoById(ids[n - 1]) : undefined;
    try {
      await rememberBrandMark({ brand, marks, itemType: l.item_type, image: imageFromDataUrl(photo?.previewUrl) });
    } catch {
      onEdit(g.id, { brand_remembered: false });
    }
  };
  const chooseBrand = (brand: string) => {
    const { listing: next } = applyChosenBrand(l, brand);
    onEdit(g.id, {
      brand: next.brand,
      brand_source: next.brand_source,
      brand_confirmed: true,
      brand_remembered: true,
      item_specifics: next.item_specifics,
      title: next.title,
      description: next.description,
    });
    void rememberMark(brand);
  };
  // The lister doubts the brand: marks it could not settle, or a brand read
  // from a mark only. A brand from a label is plain — no box (11 Nov 2026).
  const brandDoubt =
    !!l.maker_marks?.length && (!l.brand || brandNeedsConfirmation(l) || !!l.brand_candidates?.length && !l.brand_confirmed);

  // Every field eBay has for this category, grouped as eBay ranks them.
  const aspects: AspectMeta[] = g.preparation?.aspects ?? [];
  const known = new Set(aspects.map((x) => x.name));
  const extra = Object.keys(d.specifics).filter((k) => !known.has(k) && k !== "Brand");
  const groups: { key: string; title: string; items: { name: string; meta?: AspectMeta }[] }[] = [
    { key: "req", title: "Required", items: aspects.filter((x) => x.required && x.name !== "Brand").map((meta) => ({ name: meta.name, meta })) },
    { key: "rec", title: "Recommended", items: aspects.filter((x) => !x.required && x.usage === "RECOMMENDED").map((meta) => ({ name: meta.name, meta })) },
    {
      key: "opt",
      title: "Optional",
      items: [
        ...aspects.filter((x) => !x.required && x.usage !== "RECOMMENDED").map((meta) => ({ name: meta.name, meta })),
        ...extra.map((name) => ({ name })),
      ],
    },
  ];
  const filled = (name: string) => Boolean((d.specifics[name] ?? "").trim());
  const counts = groups.map((gr) => ({
    ...gr,
    total: gr.items.length + (gr.key === "req" && known.has("Brand") ? 1 : 0),
    empty:
      gr.items.filter((i) => !filled(i.name)).length +
      (gr.key === "req" && known.has("Brand") && !filled("Brand") && !(l.brand ?? "").trim() ? 1 : 0),
  }));

  const setSpecific = (name: string, value: string) => {
    if (name === "Department") {
      const family = (l.category || "clothing").replace(/^(womens|mens)_/, "");
      return d.edit({
        category: value === "Women" ? `womens_${family}` : value === "Men" ? `mens_${family}` : l.category,
        item_specifics: { ...d.specifics, Department: value },
      });
    }
    d.edit({ item_specifics: { ...d.specifics, [name]: value } });
  };

  const field = (name: string, meta?: AspectMeta, groupKey = "opt") => {
    const value = d.specifics[name] ?? "";
    const empty = !value.trim();
    const tone = empty ? (meta?.required ? " empty-required" : " empty") : "";
    const picker =
      meta &&
      meta.cardinality !== "MULTI" &&
      (meta.mode === "SELECTION_ONLY" || (PICK_FROM_LIST.has(name.toLowerCase()) && meta.values.length > 0));
    const vintageHint = /^vintage$/i.test(name) && l.vintage?.source === "clues" && !l.vintage.confirmed;
    return (
      <div key={name} id={a(`aspect:${name}`)} className={`spec${tone}`} data-group={groupKey}>
        <label className="spec-name" htmlFor={`${a(`aspect:${name}`)}-in`}>
          {name}
          {meta?.required ? " *" : ""}
        </label>
        {picker ? (
          <select id={`${a(`aspect:${name}`)}-in`} value={value} onChange={(e) => setSpecific(name, e.target.value)}>
            <option value="">{meta?.required ? "Required — choose" : "—"}</option>
            {value && !meta!.values.includes(value) && <option value={value}>{value} — not on eBay&apos;s list</option>}
            {meta!.values.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ) : (
          <input
            id={`${a(`aspect:${name}`)}-in`}
            value={value}
            placeholder={meta?.required ? "Required — not filled" : meta?.cardinality === "MULTI" ? "— (several: use |)" : "—"}
            onChange={(e) => setSpecific(name, e.target.value)}
          />
        )}
        {vintageHint && (
          <div className="vintage-hint">
            <span>
              Looks vintage{l.vintage?.era ? ` (${l.vintage.era})` : ""} — check
            </span>
            <button type="button" onClick={() => onEdit(g.id, confirmVintage(l, aspects))}>
              Yes
            </button>
            <button
              type="button"
              onClick={() => onEdit(g.id, { vintage: undefined, item_specifics: { ...d.specifics, Vintage: "No" } })}
            >
              No
            </button>
          </div>
        )}
      </div>
    );
  };

  const prepared = Boolean(g.preparation);
  const photos = g.photoIds.map((id) => photoById(id)).filter((p): p is Photo => Boolean(p));
  const zoomed = zoom === null ? undefined : photos[zoom];
  const movePhoto = (from: number, to: number) => {
    if (from === to) return;
    const order = photos.map((p) => p.id);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    onGroupEdit(g.id, { photoIds: [...order, ...g.photoIds.filter((id) => !order.includes(id))] });
  };
  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <fieldset className="draft-halves" disabled={locked || d.busy}>
      {/* ---------------- LEFT ---------------- */}
      <div className="draft-half draft-left">
        <div className="df" id={a("title")}>
          <label htmlFor={`${a("title")}-in`} className="df-label">
            Title{" "}
            <span className={`count${l.title.length > TITLE_LIMIT ? " over" : ""}`}>
              {l.title.length} / {TITLE_LIMIT}
            </span>
            <CopyButton text={l.title} label="title" />
          </label>
          <textarea
            id={`${a("title")}-in`}
            className="df-title"
            rows={2}
            value={l.title}
            onChange={(e) => onEdit(g.id, { title: e.target.value.replace(/\n/g, " ") })}
          />
        </div>

        <div className="df photos-df" id={a("photos")}>
          <span className="df-label">
            Photos · {photos.length} · Click to zoom
          </span>
          <div className="photo-row">
            {photos.map((p, i) => (
              <div
                key={p.id}
                className={`photo-cell${dragOver === i && dragFrom !== null && dragFrom !== i ? " drop-here" : ""}${dragFrom === i ? " dragging" : ""}`}
                draggable={!locked}
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOver !== i) setDragOver(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) movePhoto(dragFrom, i);
                  endDrag();
                }}
                onDragEnd={endDrag}
              >
                <button type="button" className="photo-thumb" onClick={() => setZoom(i)} aria-label={`Zoom photo ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.previewUrl} alt="" draggable={false} />
                </button>
                {/* Takes the photo off this listing only — not off the computer. */}
                <button
                  type="button"
                  className="photo-remove"
                  aria-label={`Remove photo ${i + 1}`}
                  title="Remove this photo"
                  onClick={() =>
                    onGroupEdit(g.id, {
                      photoIds: g.photoIds.filter((x) => x !== p.id),
                      ...(g.analysisPhotoIds ? { analysisPhotoIds: g.analysisPhotoIds.filter((x) => x !== p.id) } : {}),
                    })
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            {Array.from({ length: Math.max(0, photoLimit - photos.length) }, (_, i) => (
              <button
                key={`add-${i}`}
                type="button"
                className="photo-thumb photo-add"
                aria-label="Add photos"
                disabled={adding}
                onClick={() => addInput.current?.click()}
              >
                {adding && i === 0 ? <span className="spinner small" aria-hidden="true" /> : "+"}
              </button>
            ))}
          </div>
          <input
            ref={addInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void addPhotos(e.target.files)}
          />
          {justAdded > 0 && (
            <div className="photos-added" role="alert">
              <span>
                You added {justAdded} photo{justAdded > 1 ? "s" : ""}. Re-analyze listing?
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setJustAdded(0);
                  onRetry(g.id);
                }}
              >
                Yes
              </button>
              <button type="button" className="btn" onClick={() => setJustAdded(0)}>
                No
              </button>
            </div>
          )}
        </div>

        <div className="money-row">
          <div className="df" id={a("price")}>
            <label htmlFor={`${a("price")}-in`} className="df-label">
              Price
            </label>
            <div className="price-input">
              <span aria-hidden="true">$</span>
              <input
                id={`${a("price")}-in`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="big"
                value={toInput(l.suggested_price)}
                onChange={(e) => onEdit(g.id, { suggested_price: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </div>
            <div className="offer-row" id={a("offer")}>
              <label>
                <input
                  type="checkbox"
                  checked={g.allowOffers !== false}
                  onChange={(e) => onGroupEdit(g.id, { allowOffers: e.target.checked })}
                />{" "}
                Allow offers
              </label>
              {g.allowOffers !== false && (
                <label>
                  Minimum offer amount ${" "}
                  <input
                    type="number"
                    className="no-spin"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    aria-label="Minimum offer amount"
                    placeholder="none"
                    value={g.minOffer ?? ""}
                    onChange={(e) => onGroupEdit(g.id, { minOffer: e.target.value === "" ? "" : Number(e.target.value) })}
                  />
                </label>
              )}
              <span className="hint">eBay declines lower offers for you</span>
            </div>
            {g.lookup?.status === "found" && g.lookup.retail_price && g.lookup.source && (
              <span className="hint retail-hint">
                Retail {g.lookup.retail_price} at{" "}
                <a href={g.lookup.source.url} target="_blank" rel="noopener noreferrer">
                  {g.lookup.source.site} ↗
                </a>
              </span>
            )}
            {g.comps?.ok && g.comps.median !== undefined && (
              <span className="hint" title={g.comps.basis}>
                Market: {g.comps.count} similar, ${g.comps.low?.toFixed(0)}–${g.comps.high?.toFixed(0)} ·{" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onEdit(g.id, { suggested_price: g.comps!.listPrice ?? g.comps!.median })}
                >
                  use ${(g.comps.listPrice ?? g.comps.median).toFixed(2)}
                </button>
              </span>
            )}
          </div>
          <div className="df">
            <label htmlFor={`cost-${g.id}`} className="df-label">
              Cost of goods
            </label>
            <div className="price-input">
              <span aria-hidden="true">$</span>
              <input
                id={`cost-${g.id}`}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={g.cost ?? ""}
                onChange={(e) => {
                  const cost = e.target.value === "" ? "" : Number(e.target.value);
                  onGroupEdit(g.id, { cost, sku: withCost(g.sku, cost) });
                }}
              />
            </div>
          </div>
          <div className="df" id={a("sku")}>
            <label htmlFor={`${a("sku")}-in`} className="df-label">
              SKU
            </label>
            <input id={`${a("sku")}-in`} value={g.sku} onChange={(e) => onRenameSku(g.id, e.target.value)} />
          </div>
        </div>

        <div className="df draft-notes" id={a("notes")}>
          <label htmlFor={`${a("notes")}-in`} className="df-label">
            Notes
          </label>
          <textarea
            id={`${a("notes")}-in`}
            rows={1}
            value={g.notes ?? ""}
            placeholder="What you know about this item — e.g. copper flower, bronze disc; zipper works"
            onChange={(e) => onGroupEdit(g.id, { notes: e.target.value })}
          />
          <div className="draft-notes-row">
            <button
              type="button"
              className="btn btn-small"
              disabled={updating || !(g.notes ?? "").trim() || (g.notes ?? "").trim() === (l.seller_notes ?? "").trim()}
              onClick={() => void updateWithNotes()}
            >
              {updating ? (
                <>
                  <span className="spinner small" aria-hidden="true" /> Updating…
                </>
              ) : (
                "Update with notes"
              )}
            </button>
            {updateMsg && <span className={`hint${updateMsg.error ? " warn" : ""}`}>{updateMsg.text}</span>}
          </div>
        </div>

        <div className="df" id={a("description")}>
          <label htmlFor={`${a("description")}-in`} className="df-label">
            Description{" "}
            <span className={`count${l.description.length > DESCRIPTION_LIMIT ? " over" : ""}`}>
              {l.description.length} / {DESCRIPTION_LIMIT}
            </span>
            <CopyButton text={l.description} label="description" />
          </label>
          <textarea
            id={`${a("description")}-in`}
            ref={descRef}
            className="df-description"
            value={l.description}
            onChange={(e) => onEdit(g.id, { description: e.target.value })}
          />
          {l.description.length > DESCRIPTION_LIMIT && (
            <p className="hint warn">
              {l.description.length} characters — buyers on a phone see {DESCRIPTION_LIMIT} in full.
            </p>
          )}
          {!!l.contact_seen?.length && (
            <p className="hint warn">
              Contact details are visible on a photo ({l.contact_seen.join("; ")}) — eBay hides such listings; crop or
              remove that photo.
            </p>
          )}
        </div>

        <div>
          <button type="button" className="btn btn-reanalyze" onClick={() => onRetry(g.id)}>
            ↻ Re-analyze selected photos (replaces this draft)
          </button>
        </div>

        {!!(l.hashtags?.length || l.etsy_tags?.length) && (
          <div className="df other-shops">
            <OtherShopsTags listing={l} onEdit={(patch) => onEdit(g.id, patch)} />
          </div>
        )}

        <div className="policy-grid" id={a("shipping")}>
          {(
            [
              ["fulfillment", "fulfillmentPolicyId", "Shipping"],
              ["returns", "returnPolicyId", "Returns"],
              ["payment", "paymentPolicyId", "Payment"],
              ["locations", "locationKey", "Ship from"],
            ] as const
          ).map(([kind, key, label]) => (
            <label key={key} className="policy">
              <span>{label}</span>
              <select
                value={g.shipping?.[key] ?? ""}
                onChange={(e) => onGroupEdit(g.id, { shipping: { ...g.shipping, [key]: e.target.value } })}
              >
                <option value="">Select…</option>
                {!d.options && g.shipping?.[key] && <option value={g.shipping[key]}>{g.shipping[key]} (saved)</option>}
                {d.options?.[kind].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {d.options && d.options.returns.length === 0 && (
          <p className="hint warn">No returns-accepted policy was found in your eBay account.</p>
        )}
        {d.options && !d.options.locations.length && (
          <p className="hint warn">Create an inventory location with your real address in eBay before publishing.</p>
        )}
        <details className="df-more">
          <summary>More: reload policies · market check · AI cost</summary>
          <button type="button" onClick={() => void d.loadOptions()}>
            Reload my eBay policies
          </button>{" "}
          <button type="button" onClick={() => void d.research()}>
            Check similar listings on eBay
          </button>
          {g.comps?.sources && (
            <ul className="hint">
              {g.comps.sources.map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>{" "}
                  — ${s.price.toFixed(2)}
                </li>
              ))}
            </ul>
          )}
          {!!g.usage?.length && (
            <p className="hint">
              AI cost of this draft so far: ${g.usage.reduce((n, u) => n + (u.estimatedUsd ?? 0), 0).toFixed(3)}
            </p>
          )}
        </details>
      </div>

      {/* ---------------- RIGHT ---------------- */}
      <div className="draft-half draft-right">
        <div className="df" id={a("category")}>
          <span className="df-label">eBay category</span>
          {d.choices && d.choices.options.length > 1 ? (
            <select
              className="big"
              value={l.category_id ?? ""}
              onChange={(e) => {
                const o = d.choices!.options.find((x) => x.id === e.target.value);
                if (o) d.switchCategory(o);
              }}
            >
              {d.choices.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.path.split(" > ").pop()}
                </option>
              ))}
            </select>
          ) : (
            <strong className="big">
              {g.preparation?.categoryName ?? (l.category_path || "").split(" > ").pop() ?? ""}
              {!g.preparation?.categoryName && !l.category_path ? "Not chosen yet" : ""}
            </strong>
          )}
          <span className="hint">{l.category_path || g.preparation?.categoryName}</span>
          {d.switching && <span className="hint">Filling the fields for this category…</span>}
          {(d.error || g.preparationError) && <p className="note-error">{d.error || g.preparationError}</p>}
          {!prepared && (
            <button type="button" className="btn" onClick={() => void d.prepare()}>
              {d.busy ? "Working…" : "Prepare category and fields"}
            </button>
          )}
        </div>

        <div className="df" id={a("brand")}>
          <label className="df-label" htmlFor={`${a("brand")}-in`}>
            Brand{known.has("Brand") && aspects.find((x) => x.name === "Brand")?.required ? " *" : ""}
          </label>
          <input
            id={`${a("brand")}-in`}
            className={`big${!(d.specifics.Brand ?? l.brand ?? "").trim() ? " empty-required-input" : ""}`}
            value={d.specifics.Brand ?? l.brand ?? ""}
            placeholder="Required — not filled"
            onChange={(e) => d.edit({ item_specifics: { ...d.specifics, Brand: e.target.value } })}
          />
          {brandDoubt && (
            <div className="brand-doubt">
              <p>
                The lister was not sure about the brand
                {l.maker_marks?.length ? <> — mark seen: “{l.maker_marks.join("; ")}”</> : null}. Remember the mark as:
              </p>
              <div className="brand-doubt-buttons">
                {brandNeedsConfirmation(l) && (
                  <button type="button" onClick={() => chooseBrand(l.brand ?? "")}>
                    ✓ {l.brand}
                  </button>
                )}
                {!l.brand &&
                  l.brand_candidates?.map((c) => (
                    <button key={c.brand} type="button" title={c.why} onClick={() => chooseBrand(c.brand)}>
                      {c.brand}
                    </button>
                  ))}
                <button type="button" onClick={() => chooseBrand("Unbranded")}>
                  Unbranded
                </button>
                <button type="button" onClick={() => chooseBrand("Handmade")}>
                  Handmade
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const b = await requestText("Which brand is it?");
                    if (b?.trim()) chooseBrand(b.trim());
                  }}
                >
                  Another brand…
                </button>
              </div>
            </div>
          )}
          {l.brand_remembered && brandDoubt === false && l.maker_marks?.length ? (
            <span className="hint">🧠 Remembered — future marks are compared with this one.</span>
          ) : null}
        </div>

        <div className="df" id={a("condition")}>
          <label className="df-label" htmlFor={`${a("condition")}-in`}>
            Condition
          </label>
          {prepared ? (
            <select
              id={`${a("condition")}-in`}
              className="big"
              value={l.ebay_condition ?? ""}
              onChange={(e) => {
                const accepted = g.preparation!.conditions.map((c) => c.value);
                if (!e.target.value) return d.edit({ ebay_condition: "" });
                const grade = gradeForEbayCondition(e.target.value, accepted);
                d.edit({ ...gradeChange(l, grade, accepted), ebay_condition: e.target.value });
              }}
            >
              <option value="">Choose condition</option>
              {g.preparation!.conditions.map((c) => (
                <option key={c.value} value={c.value}>
                  {conditionMenuLabel(c.value, g.preparation!.conditions.map((x) => x.value))}
                </option>
              ))}
            </select>
          ) : (
            <select
              id={`${a("condition")}-in`}
              className="big"
              value={l.condition ?? "GOOD"}
              onChange={(e) => onEdit(g.id, gradeChange(l, e.target.value, []))}
            >
              {GRADES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          <textarea
            aria-label="Condition notes"
            rows={3}
            value={l.condition_notes ?? ""}
            onChange={(e) => d.edit({ condition_notes: e.target.value })}
          />
        </div>

        <div className="spec-head">
          <h3>Item specifics</h3>
          <span className="hint">
            {g.preparation?.categoryName ?? "Category not prepared"}
            {aspects.length ? ` · eBay has ${aspects.length} fields here` : ""}
          </span>
        </div>
        {aspects.length > 0 && (
          <div className="spec-counts">
            {counts.map((c) => (
              <div key={c.key} className={`spec-count${c.key === "req" && c.empty ? " amber" : " green"}`}>
                <b>{c.title}</b> {c.total}
                <br />
                <b>
                  {c.empty} empty{c.key === "req" && c.empty ? " — cannot post" : ""}
                </b>
              </div>
            ))}
          </div>
        )}
        {counts.map(
          (c) =>
            c.items.length > 0 && (
              <section key={c.key} className="spec-group">
                <h4>
                  {c.title} · {c.total} · {c.empty} empty
                </h4>
                <div className="spec-grid">{c.items.map((i) => field(i.name, i.meta, c.key))}</div>
              </section>
            ),
        )}
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const name = await requestText("Field name, such as Model");
            if (name?.trim()) d.edit({ item_specifics: { ...d.specifics, [name.trim()]: "" } });
          }}
        >
          + Add a field
        </button>
        {g.preparation?.fill && <p className="hint">Photo analysis: {g.preparation.fill}</p>}
      </div>

      {zoomed && (
        <div className="zoom" role="dialog" aria-label={`Photo ${zoom! + 1}`} onClick={() => setZoom(null)}>
          {zoom! > 0 && (
            <button
              type="button"
              className="zoom-arrow left"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                setZoom(zoom! - 1);
              }}
            >
              <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {zoom! < photos.length - 1 && (
            <button
              type="button"
              className="zoom-arrow right"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                setZoom(zoom! + 1);
              }}
            >
              <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={zoomed.id}
            src={zoomed.uploadData ? `data:${zoomed.mediaType};base64,${zoomed.uploadData}` : zoomed.previewUrl}
            alt={`Photo ${zoom! + 1}`}
            onClick={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLImageElement).classList.toggle("zoom-in");
            }}
          />
          <p>
            Photo {zoom! + 1} of {photos.length} · click the photo to zoom in · ← → for the next · Esc to close
          </p>
        </div>
      )}
    </fieldset>
  );
}
