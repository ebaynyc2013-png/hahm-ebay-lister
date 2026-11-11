"use client";
// The eBay side of one draft — category, fields, policies, market check —
// taken out of DraftControls so the new two-half draft screen (11 Nov 2026)
// can put its pieces on the left and on the right. Same logic as before.
import { useEffect, useRef, useState } from "react";
import type { CategoryOption, ItemGroup, Photo } from "@/lib/types";
import type { AccountOptions } from "@/lib/ebay/publish";
import { applyShippingDefaults } from "@/lib/shipping-defaults";
import { apiPost } from "@/lib/api-client";

export function useDraftEbay(
  g: ItemGroup,
  photoById: (id: string) => Photo | undefined,
  onGroupEdit: (id: string, patch: Partial<ItemGroup>) => void,
  accountKey = 0,
) {
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [options, setOptions] = useState<AccountOptions>();
  const [error, setError] = useState("");
  const latest = useRef(g);
  latest.current = g;
  // Once per card and eBay account: another account has other policies.
  const defaultsRequested = useRef<number | null>(null);
  useEffect(() => {
    if (g.listing && defaultsRequested.current !== accountKey) {
      defaultsRequested.current = accountKey;
      void loadOptions();
    }
  }, [Boolean(g.listing), accountKey]);
  const l = g.listing!;
  const edit = (patch: Partial<typeof l>) => {
    const next = { ...l, ...patch };
    if (patch.item_specifics) {
      for (const [key, field] of [
        ["Brand", "brand"],
        ["Size", "size"],
        ["Material", "material"],
        ["Type", "item_type"],
      ] as const)
        if (key in patch.item_specifics)
          next[field] = patch.item_specifics[key];
      // The seller typing the brand herself is her word on it.
      if ("Brand" in patch.item_specifics) next.brand_confirmed = true;
      next.evidence = {};
    }
    onGroupEdit(g.id, {
      listing: next,
      compsStatus: "stale",
      comps: undefined,
    });
  };
  const specifics = l.item_specifics ?? {};
  // eBay states per category whether a Department applies and which values it
  // takes — Women/Men for adult clothing and shoes, Boys/Girls/Baby for kids,
  // nothing at all for lighters, art or most jewellery. Surfacing it up top
  // only when eBay actually asks for it keeps a dead "department" control off
  // the screen for everything else.
  const departmentMeta = g.preparation?.aspects.find(
    (a) => a.name === "Department",
  );
  const showDepartmentPicker =
    departmentMeta?.mode === "SELECTION_ONLY" && departmentMeta.values.length > 0;
  const names = [
    ...new Set([
      ...(g.preparation?.aspects ?? [])
        // Theme always shows, optional or not: it is always filled (the
        // seller's rule, 1 Nov 2026), so an empty one must be seen.
        .filter((a) => a.required || a.usage === "RECOMMENDED" || /^theme$/i.test(a.name))
        .map((a) => a.name),
      ...Object.keys(specifics),
    ]),
    // Shown by the picker above; a second control for the same value would
    // only invite the two to look out of step.
  ].filter((name) => !(showDepartmentPicker && name === "Department"));
  // The AI's category pick and its alternates. They come only from the
  // Prepare that searched for the category, so they are carried forward here.
  const choices = g.preparation?.categoryChoices;
  /**
   * Switch to another category and fill its fields at once. The fields start
   * again from what the listing was first written with, so the new category is
   * filled as if it had been the first choice — not from words the old
   * category put there.
   */
  function switchCategory(o: CategoryOption) {
    if (busy || o.id === l.category_id) return;
    const restart = { ...(g.analysisSpecifics ?? l.item_specifics ?? {}) };
    const next: typeof l = {
      ...l,
      category_id: o.id,
      category_path: o.path,
      ebay_condition: "",
      item_specifics: restart,
      evidence: { ...(g.analysisEvidence ?? {}) },
    };
    for (const [key, field] of [
      ["Brand", "brand"],
      ["Size", "size"],
      ["Material", "material"],
      ["Type", "item_type"],
    ] as const)
      if (key in restart) next[field] = restart[key];
    onGroupEdit(g.id, { listing: next, compsStatus: "stale", comps: undefined });
    setSwitching(true);
    void prepare(next).finally(() => setSwitching(false));
  }
  async function prepare(listing: typeof l = l) {
    setBusy(true);
    setError("");
    try {
      const images = (g.analysisPhotoIds ?? g.photoIds)
        .map(photoById)
        .filter((p): p is Photo => Boolean(p) && p!.analysisSelected !== false)
        .map((p) => ({ mediaType: p.mediaType, data: p.data }));
      const r = await apiPost("/api/ebay/prepare", {
        listing,
        images,
        // Every press re-reads the photos, not just the first. The fill only
        // touches aspects that are still empty, so edits already made survive.
        enrich: true,
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      if (latest.current.listing !== listing)
        throw new Error(
          "The draft changed while preparing. Prepare it again to keep your edits.",
        );
      onGroupEdit(g.id, {
        listing: d.listing,
        preparation: {
          ...d.preparation,
          categoryChoices:
            d.preparation?.categoryChoices ??
            latest.current.preparation?.categoryChoices,
        },
        preparationError: undefined,
        usage: [...(g.usage ?? []), ...(d.usage ?? [])],
        comps: undefined,
        compsStatus: "stale",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadOptions() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost("/api/ebay/options", {});
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setOptions(d.options);
      const current = latest.current;
      const shipping = applyShippingDefaults(current.shipping ?? {}, d.options);
      if (JSON.stringify(shipping) !== JSON.stringify(current.shipping ?? {}))
        onGroupEdit(g.id, { shipping });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function research() {
    setBusy(true);
    setError("");
    onGroupEdit(g.id, { compsStatus: "loading", comps: undefined });
    try {
      const r = await apiPost("/api/ebay/comps", { listing: l });
      const d = await r.json();
      if (latest.current.listing !== l) return;
      onGroupEdit(g.id, {
        comps: d.comps,
        compsStatus: d.comps?.ok ? "ready" : "unavailable",
      });
      if (!d.ok) throw new Error(d.error);
    } catch (e) {
      setError((e as Error).message);
      onGroupEdit(g.id, { compsStatus: "unavailable" });
    } finally {
      setBusy(false);
    }
  }
  return {
    l,
    specifics,
    edit,
    prepare,
    switchCategory,
    loadOptions,
    research,
    options,
    busy,
    switching,
    error,
    choices,
    departmentMeta,
    showDepartmentPicker,
  };
}

export type DraftEbay = ReturnType<typeof useDraftEbay>;
