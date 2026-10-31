import {
  applyDefaultPendantType,
  applyListingDefaults,
} from "@/lib/listing-defaults";
import {
  applyDefaultDepartment,
  expectedDepartment,
  departmentFromCategoryPath,
} from "@/lib/category-selection";
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-guard";
import {
  parseListing,
  imagesSchema,
  validationMessage,
} from "@/lib/validation";
import {
  categoryAspects,
  acceptedConditionIds,
} from "@/lib/ebay/taxonomy";
import { selectBestLeafCategory } from "@/lib/ebay/categorySelect";
import {
  buildAspects,
  reconcileAspects,
  CONDITION_ID_ENUM,
} from "@/lib/ebay/publish";
import {
  applyAspectAliases,
  enforceCardinality,
  sanitizeNumericAspects,
} from "@/lib/ebay/aspects";
import { fillShoeSizes } from "@/lib/shoe-sizes";
import { pickSizeFromList } from "@/lib/clothing-size";
import { womensForeignSize } from "@/lib/foreign-size";
import { describeFill, fillRecommendedAspects } from "@/lib/ebay/aspectFill";
import { validateAspects } from "@/lib/ebay/draft";
import { EBAY_COOKIE, accessTokenFromCookie } from "@/lib/ebay/session";
import { signReview } from "@/lib/review";
import { withDeadline } from "@/lib/network";
import { collectUsage, currentUsage } from "@/lib/ai-usage";
export const maxDuration = 180;
export async function POST(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;
  return (
    await collectUsage(() =>
      withDeadline(150_000, async () => {
        try {
          const body = await req.json();
          const listing = parseListing(body.listing);
          const images =
            body.enrich === true ? imagesSchema.parse(body.images) : [];
          const categorySelection = listing.category_id
  ? null
  : await selectBestLeafCategory(listing, images);

const suggestions = categorySelection?.suggestions ?? [];

const id =
  listing.category_id || categorySelection?.selected.id;

if (!id)
  throw new Error(
    "Could not determine a verified eBay leaf category for this item.",
  );

// eBay's path for the chosen leaf, e.g. "… > Women > Women's Shoes > Sandals".
// Found by this run's own category search when there was one; otherwise the
// path kept beside the ID from an earlier Prepare or from the suggestion the
// seller picked. Without that last source a second Prepare lost the
// Department every time, because nothing looked the category up again. Empty
// only when the ID was typed by hand.
const categoryPath =
  categorySelection?.selected.path ||
  suggestions.find((c) => c.id === id)?.path ||
  listing.category_path ||
  "";
          const token = await accessTokenFromCookie(
            req.cookies.get(EBAY_COOKIE)?.value,
          );
          const [meta, ids] = await Promise.all([
            categoryAspects(id),
            acceptedConditionIds(id, token ?? undefined),
          ]);
          if (!meta.length || !ids.size)
            throw new Error(
              "Category specifics or conditions could not be loaded. Connect eBay and retry.",
            );
          const departmentMeta = meta.find((a) => a.name === "Department");
          const expected = expectedDepartment(listing);
          if (
            expected &&
            departmentMeta?.mode === "SELECTION_ONLY" &&
            !departmentMeta.values.includes(expected)
          )
            throw new Error(
              `This category does not accept Department ${expected}. Choose the correct category.`,
            );
          // Read the department off eBay's category path rather than the
          // photos. `expected` being set means the seller (or an earlier pass)
          // already chose one, and that choice is never overwritten.
          if (departmentMeta && !expected) {
            const derived = departmentFromCategoryPath(
              categoryPath,
              departmentMeta.values,
            );
            if (derived)
              listing.item_specifics = {
                ...listing.item_specifics,
                Department: derived,
              };
          }
          applyListingDefaults(listing, meta, ids);
          const aspects = buildAspects(listing, listing.category || "", meta);
          // Twice, and deliberately. The first pass renames the analysis
          // model's keys to eBay's own and throws out values eBay has no word
          // for, which is what leaves an aspect empty for the vision pass to
          // fill from eBay's real list. The second holds whatever that pass
          // added to the same standard — it ran after the first and would
          // otherwise reach the listing unchecked. The call is idempotent, so
          // a value already in eBay's words survives both.
          const dropped = reconcileAspects(
            aspects,
            meta,
            listing,
            listing.category || "",
          );
          // Reported back to the screen. This pass is best-effort by design
          // and says nothing when it fails, which leaves the seller unable to
          // tell a considered "nothing to add" from a field never looked at.
          let fill = "not run — photo analysis was switched off for this run";
          if (body.enrich === true) {
            fill = describeFill(
              await fillRecommendedAspects(
                listing,
                aspects,
                meta,
                "draft",
                images,
              ),
            );
            reconcileAspects(aspects, meta, listing, listing.category || "");
          }
          // Nothing is put back. A word eBay has no entry for filters nothing
          // and searches nothing, so an empty aspect is the honest result —
          // and it is not silent: validateAspects below reports a missing
          // REQUIRED aspect as "Enter <name>" in the preparation issues, where
          // the seller can supply eBay's own word before publishing.
          if (Object.keys(dropped).length)
            console.log(
              `[ebay/prepare] left empty, no eBay value: ${Object.entries(dropped)
                .map(([k, v]) => `${k}=${v.join("/")}`)
                .join(", ")}`,
            );
          // Path, then photos, then the seller's note have all had their turn
          // at Department by now. Her rule for whatever is still undecided:
          // Women, where eBay offers it in this category.
          applyDefaultDepartment(aspects, meta);
          // Same idea for an ordinary pendant: Charm, when nothing more
          // specific was found (the seller's rule, 28 Oct 2026).
          applyDefaultPendantType(aspects, meta, listing);
          fillShoeSizes(aspects, meta, listing.size);
          // Size from eBay's own list ("M", not "M Medium"), or empty so the
          // card asks — the seller's rule, 31 Oct 2026.
          pickSizeFromList(aspects, meta, listing.size, womensForeignSize(listing));
          applyAspectAliases(aspects, meta);
          enforceCardinality(aspects, meta);
          sanitizeNumericAspects(aspects, meta);
          const conditions = [...ids]
            .filter((id) => CONDITION_ID_ENUM[id])
            .map((id) => ({
              value: CONDITION_ID_ENUM[id],
              label:
                id === 2990
                  ? "Pre-owned Excellent (2990)"
                  : `${CONDITION_ID_ENUM[id].replace(/_/g, " ")} (${id})`,
            }));
          if (ids.has(2990) || ids.has(3010)) {
            const c = conditions.find(
              (c) => c.value === CONDITION_ID_ENUM[3000],
            );
            if (c) c.label = "Pre-owned Good (3000)";
          }
          listing.category_id = id;
          // Kept with the ID so the next Prepare can still read Department
          // off it without searching for the category again.
          listing.category_path = categoryPath;
          listing.item_specifics = Object.fromEntries(
            Object.entries(aspects).map(([k, v]) => [k, v.join(" | ")]),
          );
          // Preserve supported seller choices/defaults; never substitute another grade.
          if (!conditions.some((c) => c.value === listing.ebay_condition))
            listing.ebay_condition = "";
          const expiresAt = Date.now() + 23 * 3600_000;
          return NextResponse.json({
            ok: true,
            listing,
            preparation: {
              categoryId: id,
              categoryName: categoryPath || `Category ${id}`,
suggestions,
              aspects: meta,
              conditions,
              expiresAt,
              signature: signReview(id, expiresAt),
              fill,
              ...(categorySelection
                ? {
                    categoryChoices: {
                      aiPick: categorySelection.selected.id,
                      options: [
                        {
                          id: categorySelection.selected.id,
                          path: categorySelection.selected.path,
                          warning: "",
                        },
                        ...categorySelection.alternatives.map((a) => ({
                          id: a.id,
                          path: a.path,
                          warning: a.warning,
                        })),
                      ],
                      reason: categorySelection.reason,
                      confidence: categorySelection.confidence,
                    },
                  }
                : {}),
              issues: validateAspects(aspects, meta),
            },
            usage: currentUsage(),
          });
        } catch (e) {
          return NextResponse.json(
            { ok: false, error: validationMessage(e), usage: currentUsage() },
            { status: 422 },
          );
        }
      }),
    )
  ).result;
}
