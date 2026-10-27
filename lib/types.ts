import type { AspectMeta } from "./ebay/taxonomy";
import type { AiUsage } from "./ai-usage";
import type { ShippingSelection } from "./validation";
// Shape of a generated listing. Mirrors the JSON the model returns in the
// Python script's analyze_photos(), plus the routed profile.

export interface ListingResult {
  title: string;
  category?: string;
  category_hint?: string;
  category_id?: string;
  /**
   * eBay's path for category_id ("… > Women > Women's Shoes > Heels"), kept
   * beside it. Department is read off this path, and it is only known when
   * the app searches for the category itself — so without it, a second
   * Prepare or a category picked from the suggestions loses the Department.
   * Cleared whenever the ID is typed by hand, since it would then be stale.
   */
  category_path?: string;
  ebay_condition?: string;
  evidence?: Record<string, number[]>;
  brand?: string;
  item_type?: string;
  color?: string[] | string;
  size?: string;
  material?: string;
  condition?: string;
  condition_notes?: string;
  measurements?: string;
  description: string;
  suggested_price?: number | string;
  search_terms?: string[];
  seo_keywords?: string[];
  key_features?: string[];
  /** Named style aesthetics the item shows — what buyers browse by. */
  aesthetics?: string[];
  /**
   * Contact details seen in the photos (a website on a label, a phone on a
   * tag) or taken out of the text. Never published — shown to the seller so
   * she crops or removes the photo; eBay hides listings that show them.
   */
  contact_seen?: string[];
  /**
   * Sections left out of the description to keep it within 800 characters
   * (eBay shows that much in full on a phone). Shown on the card.
   */
  description_dropped?: string[];
  /**
   * For the seller's other shops, shown on the card for copying and never
   * sent to eBay: up to 5 hashtags for Depop and Mercari (most important
   * first — Mercari takes 3), and 13 Etsy tags.
   */
  hashtags?: string[];
  etsy_tags?: string[];
  item_specifics?: Record<string, string>;
  item_profile?: string;
}

export interface AnalyzeRequestBody {
  // Browser-resized JPEG data URLs or raw base64 strings.
  images: { mediaType: string; data: string }[];
  profile: string;
  // Optional model overrides; server falls back to its defaults when omitted.
  analysisModel?: string;
  routerModel?: string;
}

export interface AnalyzeResponse {
  ok: boolean;
  listing?: ListingResult;
  error?: string;
}

export interface SortResponse {
  ok: boolean;
  groups?: { name: string; photoIndices: number[] }[];
  orphanIndices?: number[];
  error?: string;
}

// ── Client-side working model for the bulk flow ──────────────────────────────

export interface Photo {
  id: string;
  previewUrl: string;
  mediaType: string;
  original?: Blob;
  uploadData?: string;
  analysisSelected?: boolean;
  data: string; // base64, no prefix
}

export type ItemStatus = "idle" | "writing" | "done" | "error";

export type PostStatus = "idle" | "posting" | "posted" | "error";

// Market price check from active eBay comps (see lib/ebay/comps.ts). Advisory:
// shown beside the AI's estimate so the seller prices with real data in view.
export interface CompsSummary {
  ok: boolean;
  sources?: {
    id: string;
    title: string;
    url: string;
    price: number;
    shipping?: number;
    total?: number;
    condition: string;
  }[];
  checkedAt?: string;
  matchBasis?: string;
  query: string;
  count: number;
  median?: number;
  trimmedMean?: number;
  low?: number;
  high?: number;
  confidence: number;
  basis: string;
  // Median with the deployment's PRICE_MARKUP_PERCENT applied — what the
  // "use median" button should set. Absent when no markup is configured.
  listPrice?: number;
}

export interface ItemGroup {
  id: string;
  sku: string; // bin reference, e.g. "K75-A"
  name: string;
  photoIds: string[];
  listing?: ListingResult;
  status: ItemStatus;
  error?: string;
  analysisPhotoIds?: string[];
  /**
   * The item specifics (and their photo citations) exactly as the listing was
   * first written, before any category shaped them. Switching to another
   * category starts again from these, so the new category is filled as if it
   * had been chosen in the first place.
   */
  analysisSpecifics?: Record<string, string>;
  analysisEvidence?: Record<string, number[]>;
  preparation?: PreparedCategory;
  preparationError?: string;
  usage?: AiUsage[];
  compsStatus?: "loading" | "unavailable" | "ready" | "stale";
  shipping?: Partial<ShippingSelection>;
  imageUrls?: string[];
  uploadedPhotoIds?: string[];
  publicationAttemptSku?: string;
  evidencePhotoIds?: string[];
  // Market price check (fetched right after the listing is written)
  comps?: CompsSummary;
  // eBay posting state (Phase 2)
  postStatus?: PostStatus;
  listingId?: string;
  postError?: string;
  // Non-fatal quality warnings from the last publish (e.g. schema unavailable)
  postWarnings?: string[];
  /**
   * Post with the listing's start delayed, instead of live at once. eBay offers
   * no way to create a Seller Hub draft through its API, and its own suggested
   * item specifics only appear on Revise — so a delayed start is the window in
   * which the seller can open it on eBay and accept them before it goes live.
   */
  scheduleStart?: boolean;
  /** When a delayed listing goes live (ISO time), as eBay was told. */
  scheduledFor?: string;
}

/** One category the seller can pick on the card. */
export interface CategoryOption {
  id: string;
  path: string;
  /** Empty, or the AI's caution: a required field may have no word for the item. */
  warning?: string;
}

/**
 * The AI's category choice, kept on the card: its pick first, then 0–3
 * alternates, best first. It is produced only when the app searches for the
 * category itself (right after a listing is written), so the card carries it
 * forward through every later Prepare instead of losing it.
 */
export interface CategoryChoices {
  aiPick: string;
  options: CategoryOption[];
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface PreparedCategory {
  suggestions?: import("./ebay/taxonomy").CategorySuggestion[];
  categoryChoices?: CategoryChoices;
  categoryId: string;
  categoryName: string;
  aspects: AspectMeta[];
  conditions: { value: string; label: string }[];
  expiresAt: number;
  signature: string;
  /**
   * One sentence on what the photo-analysis pass did. It is best-effort and
   * silent on failure, so without this the seller cannot tell a considered
   * "nothing to add" from a field that was never looked at.
   */
  fill?: string;
  issues: string[];
}
