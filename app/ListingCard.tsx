"use client";

import { applyChosenBrand, photoNumberOfMark } from "@/lib/maker-marks";
import { imageFromDataUrl, rememberBrandMark } from "@/lib/brand-memory";
import { DraftControls } from "./DraftControls";
import { draftIssues } from "@/lib/client-review";
import { useEffect, useMemo, useState } from "react";
import { SIZE_REQUIRED_CATEGORIES } from "@/lib/categories";
import type { ItemGroup, ListingResult, Photo } from "@/lib/types";

const TITLE_LIMIT = 80;

// eBay's pre-owned condition tiers, matching the values the model returns.
const CONDITIONS: { value: string; label: string }[] = [
  { value: "NEW_WITH_TAGS", label: "New with tags" },
  { value: "NEW_NO_TAGS", label: "New without tags" },
  { value: "EXCELLENT", label: "Pre-owned · Excellent" },
  { value: "VERY_GOOD", label: "Pre-owned · Very good" },
  { value: "GOOD", label: "Pre-owned · Good" },
  { value: "FAIR", label: "Pre-owned · Fair" },
  { value: "FOR_PARTS_OR_NOT_WORKING", label: "For parts / not working" },
];

function formatPrice(value: ListingResult["suggested_price"]): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n === undefined || Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function priceToInput(value: ListingResult["suggested_price"]): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n === undefined || Number.isNaN(n) ? "" : String(n);
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? "✓ Copied" : `📋 Copy ${label}`}
    </button>
  );
}

interface ListingCardProps {
  group: ItemGroup;
  photoById: (id: string) => Photo | undefined;
  ebayConnected: boolean;
  onGroupEdit: (id: string, patch: Partial<ItemGroup>) => void;
  onEdit: (groupId: string, patch: Partial<ListingResult>) => void;
  onRenameSku: (groupId: string, sku: string) => void;
  onRetry: (groupId: string) => void;
  onPost: (groupId: string) => void;
}

export function ListingCard({
  group,
  photoById,
  ebayConnected,
  onEdit,
  onGroupEdit,
  onRenameSku,
  onRetry,
  onPost,
}: ListingCardProps) {
  const [open, setOpen] = useState(true);
  const listing = group.listing;
  const cover = photoById(group.photoIds[0]);

  const specifics = useMemo(() => {
    const entries = Object.entries(listing?.item_specifics ?? {});
    return entries.filter(
      ([k, v]) => v && String(v).trim() !== "" && !k.startsWith("---"),
    );
  }, [listing?.item_specifics]);

  const titleLen = listing?.title?.length ?? 0;

  // eBay's size standardization blocks apparel/footwear listings that are
  // missing a Size, so flag those for the seller before they post.
  const sizeRequired = SIZE_REQUIRED_CATEGORIES.has(listing?.category ?? "");
  const sizeMissing = sizeRequired && !(listing?.size ?? "").trim();

  // Publishing refuses a missing/zero price (no more invented defaults), so
  // flag it here the same way size is flagged — before the seller hits Post.
  const priceNum =
    typeof listing?.suggested_price === "string"
      ? parseFloat(listing.suggested_price)
      : listing?.suggested_price;
  const priceMissing =
    group.status === "done" &&
    (priceNum === undefined || Number.isNaN(priceNum) || priceNum <= 0);

  // Keep a confirmed maker's mark: its description and the small copy of the
  // photo it was seen on ("Photo 2: …"). The program learns marks only from
  // the seller, never from other eBay listings.
  const rememberMark = async (brand: string) => {
    if (!listing || !brand.trim()) return;
    const marks = listing.maker_marks ?? [];
    const n = marks.map(photoNumberOfMark).find((x): x is number => Boolean(x));
    const ids = group.evidencePhotoIds ?? group.analysisPhotoIds ?? group.photoIds;
    const photo = n ? photoById(ids[n - 1]) : undefined;
    try {
      await rememberBrandMark({
        brand,
        marks,
        itemType: listing.item_type,
        image: imageFromDataUrl(photo?.previewUrl),
      });
    } catch {
      onEdit(group.id, { brand_remembered: false });
    }
  };

  return (
    <article className={`listing-card status-${group.status}`}>
      <header className="listing-card-head" onClick={() => setOpen((o) => !o)}>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="listing-cover" src={cover.previewUrl} alt="" />
        )}
        <div className="listing-card-title">
          <strong>
            {group.sku && <span className="sku-tag">{group.sku}</span>}
            {listing?.title || group.name}
          </strong>
          <span className="listing-card-sub">
            {group.status === "writing" && (
              <>
                <span className="spinner small" aria-hidden="true" /> Writing…
              </>
            )}
            {group.status === "done" &&
              (priceMissing ? (
                <span style={{ color: "var(--color-danger)" }}>
                  ⚠️ needs a price
                </span>
              ) : (
                <>
                  {formatPrice(listing?.suggested_price)} ·{" "}
                  {draftIssues(group).length ? "needs review" : "ready"}
                </>
              ))}
            {group.status === "error" && (
              <span style={{ color: "var(--color-danger)" }}>
                ⚠️ {group.error || "Failed"}
              </span>
            )}
            {group.status === "idle" && "Waiting…"}
          </span>
        </div>
        {group.status === "error" ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(group.id);
            }}
          >
            ↻ Retry
          </button>
        ) : (
          <span className="chevron" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
        )}
      </header>

      {open && listing && group.status === "done" && (
        <fieldset
          className="listing-card-body"
          disabled={
            group.postStatus === "posted" || group.postStatus === "posting"
          }
        >
          <div className="result-field">
            <label>
              Title
              <span className={`count${titleLen > TITLE_LIMIT ? " over" : ""}`}>
                {titleLen}/{TITLE_LIMIT}
              </span>
            </label>
            <input
              type="text"
              className="title-input"
              value={listing.title}
              onChange={(e) => onEdit(group.id, { title: e.target.value })}
            />
            <div className="copy-row">
              <CopyButton text={listing.title} label="title" />
            </div>
          </div>

          <div className="meta-row">
            {/* SKU stays editable up until the item is posted, so a SKU fix
                never requires going back and re-writing listings (issue #30). */}
            <div className="stat editable">
              <label className="k" htmlFor={`sku-${group.id}`}>
                SKU
              </label>
              <input
                id={`sku-${group.id}`}
                type="text"
                className="size-input"
                value={group.sku}
                disabled={group.postStatus === "posted"}
                onChange={(e) => onRenameSku(group.id, e.target.value)}
              />
            </div>
            <div
              className={`stat editable${priceMissing ? " needs-attention" : ""}`}
            >
              <label className="k" htmlFor={`price-${group.id}`}>
                Price
              </label>
              <div className="price-input">
                <span aria-hidden="true">$</span>
                <input
                  id={`price-${group.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={priceToInput(listing.suggested_price)}
                  onChange={(e) =>
                    onEdit(group.id, {
                      suggested_price:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </div>
              {group.comps?.ok && group.comps.median !== undefined && (
                <span className="comps-line" title={group.comps.basis}>
                  Market: {group.comps.count} similar active listings, $
                  {group.comps.low?.toFixed(0)}–${group.comps.high?.toFixed(0)}
                  {" · "}
                  <button
                    type="button"
                    className="comps-use"
                    onClick={() =>
                      onEdit(group.id, {
                        suggested_price:
                          group.comps!.listPrice ?? group.comps!.median,
                      })
                    }
                  >
                    {/* listPrice = median + the deployment's storewide markup */}
                    {group.comps.listPrice !== undefined
                      ? `use $${group.comps.listPrice.toFixed(2)} (median + markup)`
                      : `use median $${group.comps.median.toFixed(2)}`}
                  </button>
                </span>
              )}
            </div>
            <div className="stat editable">
              <label className="k" htmlFor={`cond-${group.id}`}>
                Condition
              </label>
              <select
                id={`cond-${group.id}`}
                value={listing.condition ?? "GOOD"}
                onChange={(e) =>
                  onEdit(group.id, {
                    condition: e.target.value,
                    ebay_condition: "",
                  })
                }
              >
                {/* Keep an unexpected model value selectable rather than losing it. */}
                {listing.condition &&
                  !CONDITIONS.some((c) => c.value === listing.condition) && (
                    <option value={listing.condition}>
                      {listing.condition.replace(/_/g, " ")}
                    </option>
                  )}
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {listing.brand && (
              <div className="stat">
                <div className="k">Brand</div>
                <div className="v">{listing.brand}</div>
              </div>
            )}
            {(sizeRequired || listing.size) && (
              <div
                className={`stat editable${sizeMissing ? " needs-attention" : ""}`}
              >
                <label className="k" htmlFor={`size-${group.id}`}>
                  Size
                </label>
                <input
                  id={`size-${group.id}`}
                  type="text"
                  className="size-input"
                  value={listing.size ?? ""}
                  placeholder={sizeRequired ? "e.g. M, 32x34, 10.5" : "—"}
                  onChange={(e) => onEdit(group.id, { size: e.target.value })}
                />
              </div>
            )}
          </div>

          {sizeMissing && (
            <p className="size-warning" role="alert">
              ⚠️ No size found on the tag. eBay now blocks apparel listings
              without a standard size — check the photos or measure the item,
              then fill in Size above before posting.
            </p>
          )}

          {!!listing?.maker_marks?.length && (
            <div className="size-warning maker-marks" role="alert">
              <p>🔎 Maker&rsquo;s mark seen: {listing.maker_marks.join("; ")}.</p>
              {listing.brand ? (
                listing.brand_source === "marks" && !listing.brand_confirmed ? (
                  <p>
                    The brand {listing.brand} was read from several marks, not
                    from a name on the piece — check it before posting.
                  </p>
                ) : null
              ) : listing.brand_candidates?.length ? (
                <p>
                  The marks do not settle the maker. Pick the right one, or
                  type the brand in Brand under Editable item specifics:
                </p>
              ) : (
                <p>
                  No brand was written — if you know whose mark it is, type it
                  in Brand under Editable item specifics.
                </p>
              )}
              <div className="brand-actions">
                {listing.brand_source === "marks" &&
                  listing.brand &&
                  listing.brand_confirmed === false && (
                    <button
                      type="button"
                      className="confirm-brand"
                      onClick={() => {
                        onEdit(group.id, {
                          brand_confirmed: true,
                          brand_remembered: true,
                        });
                        void rememberMark(listing.brand ?? "");
                      }}
                    >
                      ✓ Yes, the brand is {listing.brand}
                    </button>
                  )}
                {!listing.brand &&
                  listing.brand_candidates?.map((c) => (
                    <button
                      key={c.brand}
                      type="button"
                      className="confirm-brand"
                      title={c.why}
                      onClick={() => {
                        const { listing: next } = applyChosenBrand(listing, c.brand);
                        onEdit(group.id, {
                          brand: next.brand,
                          brand_source: next.brand_source,
                          brand_confirmed: true,
                          brand_remembered: true,
                          item_specifics: next.item_specifics,
                          title: next.title,
                          description: next.description,
                        });
                        void rememberMark(c.brand);
                      }}
                    >
                      Use {c.brand}
                      {c.why ? <span className="why"> — {c.why}</span> : null}
                    </button>
                  ))}
                {listing.brand &&
                  !listing.brand_remembered &&
                  !(listing.brand_source === "marks" && !listing.brand_confirmed) && (
                    <button
                      type="button"
                      className="remember-brand"
                      onClick={() => {
                        onEdit(group.id, { brand_remembered: true });
                        void rememberMark(listing.brand ?? "");
                      }}
                    >
                      🧠 Remember: this mark belongs to {listing.brand}
                    </button>
                  )}
              </div>
              {listing.brand &&
                listing.brand_source === "seller" &&
                !listing.title.toLowerCase().includes(listing.brand.toLowerCase()) && (
                  <p>
                    {listing.brand} did not fit in the 80-character title — add
                    it to the title by hand, right after any Vintage and era.
                  </p>
                )}
              {listing.brand_remembered && (
                <p className="remembered">
                  🧠 Remembered — the program will compare future marks with
                  this one.
                </p>
              )}
            </div>
          )}

          {!!listing?.contact_seen?.length && (
            <p className="size-warning" role="alert">
              ⚠️ Contact details are visible: {listing.contact_seen.join("; ")}.
              They are kept out of the title, description and specifics, but
              eBay also hides listings whose PHOTOS show a website, phone,
              email or @account — crop or remove that photo before posting.
            </p>
          )}

          {priceMissing && (
            <p className="size-warning" role="alert">
              ⚠️ No price yet — the analysis couldn&rsquo;t estimate one for
              this item. Set a price above before posting
              {group.comps?.ok ? " (see the market check under Price)" : ""}.
            </p>
          )}

          <div className="result-field">
            <label>Description</label>
            <textarea
              value={listing.description}
              onChange={(e) =>
                onEdit(group.id, { description: e.target.value })
              }
              rows={8}
            />
            <div className="copy-row">
              <CopyButton text={listing.description} label="description" />
            </div>
          </div>

          <button type="button" onClick={() => onRetry(group.id)}>
            Re-analyze selected photos (replaces this draft)
          </button>
          <DraftControls
            group={group}
            photoById={photoById}
            onGroupEdit={onGroupEdit}
          />
          {/* eBay posting */}
          {group.postStatus === "posted" ? (
            <>
              <p className="post-result ok">
                {group.scheduledFor
                  ? `✅ Scheduled on eBay — goes live ${new Date(
                      group.scheduledFor,
                    ).toLocaleString()}. Open it on eBay and use Revise to accept eBay's suggested item specifics before then.`
                  : "✅ Posted to eBay"}
                {group.listingId ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={`https://www.ebay.com/itm/${group.listingId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View listing ↗
                    </a>
                  </>
                ) : null}
              </p>
              {(group.postWarnings ?? []).map((w) => (
                <p className="post-result warn" key={w}>
                  ⚠️ {w}
                </p>
              ))}
            </>
          ) : ebayConnected ? (
            <div className="post-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onPost(group.id)}
                disabled={
                  group.postStatus === "posting" ||
                  draftIssues(group).length > 0
                }
              >
                {group.postStatus === "posting" ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Posting to
                    eBay…
                  </>
                ) : group.scheduleStart ? (
                  "🕒 Schedule on eBay (starts in 24 h)"
                ) : (
                  "🚀 Post this to eBay"
                )}
              </button>
              <label className="post-hint">
                <input
                  type="checkbox"
                  checked={group.scheduleStart === true}
                  disabled={group.postStatus === "posting"}
                  onChange={(e) =>
                    onGroupEdit(group.id, { scheduleStart: e.target.checked })
                  }
                />{" "}
                Delay start by 24 hours — time to open it on eBay, press Revise
                and accept eBay&apos;s suggested item specifics before it goes
                live
              </label>
              {group.postStatus === "error" && group.postError && (
                <p className="post-result err">⚠️ {group.postError}</p>
              )}
            </div>
          ) : (
            <p className="post-hint">
              Connect eBay (top of page) to post this listing.
            </p>
          )}
        </fieldset>
      )}
    </article>
  );
}
