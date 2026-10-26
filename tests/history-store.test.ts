import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { loadDraft, saveDraft } from "@/lib/draft-store";
import {
  deleteFromHistory,
  historyPhotos,
  loadHistory,
  resetHistoryMemo,
  saveToHistory,
} from "@/lib/history-store";
import type { ItemGroup, Photo } from "@/lib/types";

const photo = (id: string): Photo => ({
  id,
  data: `full-${id}`,
  uploadData: `upload-${id}`,
  previewUrl: `data:image/jpeg;base64,small-${id}`,
  mediaType: "image/jpeg",
  original: new Blob([`original ${id}`]),
});

const card = (id: string, photoIds: string[], extra: Partial<ItemGroup> = {}): ItemGroup => ({
  id,
  sku: `SKU-${id}`,
  name: id,
  photoIds,
  status: "done",
  listing: { title: `Title ${id}`, description: "Desc" },
  ...extra,
});

beforeEach(async () => {
  resetHistoryMemo();
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase("listing-writer-drafts");
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
});

describe("History keeps every written card", () => {
  it("keeps an unpublished card with its full photos, ready to publish", async () => {
    const shoes = card("shoes", ["p1", "p2"]);
    expect(await saveToHistory([shoes], [photo("p1"), photo("p2")])).toBe(true);
    const [entry] = await loadHistory();
    expect(entry.group.listing?.title).toBe("Title shoes");
    expect(entry.published).toBe(false);
    expect(entry.thumb).toBe("data:image/jpeg;base64,small-p1");
    const back = await historyPhotos(["p1", "p2"]);
    expect(back.map((p) => p.data)).toEqual(["full-p1", "full-p2"]);
    expect(back[0].uploadData).toBe("upload-p1");
    expect(await back[0].original?.text()).toBe("original p1");
  });

  it("does not keep a card that has no listing yet", async () => {
    const idle = { ...card("idle", ["p1"]), listing: undefined, status: "idle" as const };
    expect(await saveToHistory([idle], [photo("p1")])).toBe(false);
    expect(await loadHistory()).toEqual([]);
  });

  it("keeps only the small photos once the card is published", async () => {
    await saveToHistory([card("shoes", ["p1"])], [photo("p1")]);
    await saveToHistory(
      [card("shoes", ["p1"], { postStatus: "posted", listingId: "327422741986" })],
      [photo("p1")],
    );
    const [entry] = await loadHistory();
    expect(entry.published).toBe(true);
    const [p] = await historyPhotos(["p1"]);
    expect(p.data).toBe("");
    expect(p.original).toBeUndefined();
    expect(p.previewUrl).toBe("data:image/jpeg;base64,small-p1");
  });

  it("shrinks a published card's photo even after it left the work screen", async () => {
    await saveToHistory([card("art", ["p9"])], [photo("p9")]);
    await saveToHistory([card("art", ["p9"], { postStatus: "posted" })], []);
    const [p] = await historyPhotos(["p9"]);
    expect(p.data).toBe("");
    expect(p.previewUrl).toBe("data:image/jpeg;base64,small-p9");
  });

  it("does not rewrite a card that has not changed", async () => {
    const shoes = card("shoes", ["p1"]);
    await saveToHistory([shoes], [photo("p1")]);
    expect(await saveToHistory([shoes], [photo("p1")])).toBe(false);
    expect(
      await saveToHistory(
        [{ ...shoes, listing: { title: "Edited", description: "Desc" } }],
        [photo("p1")],
      ),
    ).toBe(true);
    expect((await loadHistory())[0].group.listing?.title).toBe("Edited");
  });

  it("lists the newest first", async () => {
    await saveToHistory([card("old", ["a"])], [photo("a")]);
    await new Promise((r) => setTimeout(r, 5));
    await saveToHistory([card("new", ["b"])], [photo("b")]);
    expect((await loadHistory()).map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("deletes one card and only the photos no other card uses", async () => {
    await saveToHistory(
      [card("a", ["shared", "onlyA"]), card("b", ["shared"])],
      [photo("shared"), photo("onlyA")],
    );
    await deleteFromHistory("a");
    expect((await loadHistory()).map((e) => e.id)).toEqual(["b"]);
    expect((await historyPhotos(["shared", "onlyA"])).map((p) => p.id)).toEqual(["shared"]);
  });

  it("lives beside the saved work without touching it", async () => {
    await saveDraft({
      version: 1,
      photos: [photo("p1")],
      groups: [card("shoes", ["p1"])],
      orphanIds: [],
      binPrefix: "",
      skuStart: 0,
      step: "listings",
      updatedAt: 1,
    });
    await saveToHistory([card("shoes", ["p1"])], [photo("p1")]);
    expect((await loadDraft())?.groups[0].id).toBe("shoes");
  });
});
