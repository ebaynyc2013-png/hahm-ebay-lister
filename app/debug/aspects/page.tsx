import type { Metadata } from "next";
import { categoryAspects, type AspectMeta } from "@/lib/ebay/taxonomy";

// What eBay's Taxonomy API actually returns for a category, laid out plainly.
//
// The listing form on ebay.com and the Taxonomy API disagree: Dress Length is
// a dropdown of Short / Knee Length / Midi / Long on the website and comes back
// FREE_TEXT from the API. Rules about what may be filled from a photo turn on
// exactly that distinction, so they have to be written against what the API
// says, not against what the website shows.
//
// Reads eBay's public category dictionary and nothing else — no listings, no
// orders, no account data.

export const metadata: Metadata = {
  title: "Category fields — Listing Writer",
  description: "What eBay asks for in a category.",
};

export const dynamic = "force-dynamic";

const EXAMPLES: [string, string][] = [
  ["63861", "Women's Dresses"],
  ["15724", "Women's Tops"],
  ["62107", "Women's Sandals"],
  ["261990", "Fine Jewelry · Earrings"],
  ["155101", "Fashion Jewelry · Necklaces"],
  ["164321", "Cigarette Cases"],
];

function Badge({ children, tone }: { children: string; tone: string }) {
  return (
    <span
      style={{
        background: tone,
        borderRadius: 4,
        padding: "1px 6px",
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Row({ a }: { a: AspectMeta }) {
  const menu = a.mode === "SELECTION_ONLY";
  return (
    <tr style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}>
      <td style={{ padding: "6px 8px", fontWeight: a.required ? 700 : 400 }}>
        {a.name}
        {a.required ? " *" : ""}
      </td>
      <td style={{ padding: "6px 8px" }}>
        <Badge tone={menu ? "#d8f0d8" : "#f0e4d8"}>
          {menu ? "menu" : "free text"}
        </Badge>
      </td>
      <td style={{ padding: "6px 8px", fontSize: 13 }}>{a.usage}</td>
      <td style={{ padding: "6px 8px", fontSize: 13 }}>{a.cardinality}</td>
      <td style={{ padding: "6px 8px", fontSize: 13 }}>
        {a.dataType ?? "—"}
      </td>
      <td style={{ padding: "6px 8px", fontSize: 13 }}>{a.values.length}</td>
      <td
        style={{
          padding: "6px 8px",
          fontSize: 13,
          color: "var(--color-ink-soft)",
        }}
      >
        {a.values.length ? a.values.slice(0, 40).join(" · ") : "—"}
        {a.values.length > 40 ? ` … +${a.values.length - 40}` : ""}
      </td>
    </tr>
  );
}

export default async function AspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const id = (category ?? "").trim();
  let aspects: AspectMeta[] = [];
  let error = "";
  if (id) {
    if (!/^\d{1,20}$/.test(id)) error = "A category id is digits only.";
    else
      try {
        aspects = await categoryAspects(id);
        if (!aspects.length)
          error = `eBay returned no fields for category ${id}. Check the id, or that EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set.`;
      } catch (e) {
        error = (e as Error).message;
      }
  }

  return (
    <main className="wrap">
      <article className="panel" style={{ lineHeight: 1.6 }}>
        <h1 style={{ fontFamily: "var(--font-display)" }}>Category fields</h1>
        <p style={{ color: "var(--color-ink-soft)" }}>
          Exactly what eBay asks for in a category, as its Taxonomy API reports
          it — the same answer this app works from. <strong>menu</strong> means
          eBay supplies the list of values to choose between;{" "}
          <strong>free text</strong> means it does not, whatever the website
          shows. A <strong>*</strong> marks a required field.
        </p>

        <form method="get" style={{ margin: "16px 0" }}>
          <label>
            Category ID{" "}
            <input
              name="category"
              defaultValue={id}
              inputMode="numeric"
              placeholder="63861"
            />
          </label>{" "}
          <button type="submit">Show fields</button>
        </form>

        <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>
          {EXAMPLES.map(([cid, label], i) => (
            <span key={cid}>
              {i ? " · " : ""}
              <a href={`?category=${cid}`}>{label}</a>
            </span>
          ))}
        </p>

        {error && <p role="alert">{error}</p>}

        {aspects.length > 0 && (
          <>
            <p style={{ marginTop: 24 }}>
              <strong>{aspects.length}</strong> fields in category {id} —{" "}
              {aspects.filter((a) => a.required).length} required,{" "}
              {aspects.filter((a) => a.mode === "SELECTION_ONLY").length} with a
              menu.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Field</th>
                    <th style={{ padding: "6px 8px" }}>Kind</th>
                    <th style={{ padding: "6px 8px" }}>Usage</th>
                    <th style={{ padding: "6px 8px" }}>Values</th>
                    <th style={{ padding: "6px 8px" }}>Type</th>
                    <th style={{ padding: "6px 8px" }}>#</th>
                    <th style={{ padding: "6px 8px" }}>What eBay offers</th>
                  </tr>
                </thead>
                <tbody>
                  {[...aspects]
                    .sort(
                      (x, y) =>
                        Number(y.required) - Number(x.required) ||
                        x.name.localeCompare(y.name),
                    )
                    .map((a) => (
                      <Row key={a.name} a={a} />
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </main>
  );
}
