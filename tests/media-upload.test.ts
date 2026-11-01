import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadPhoto, uploadPhotos } from "@/lib/ebay/publish";

// eBay decommissioned the Trading API's UploadSiteHostedPictures on
// 30 Sep 2026; photos go through the Media API (createImageFromFile) since
// 1 Nov 2026, and a refusal carries eBay's own reason.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");

afterEach(() => vi.unstubAllGlobals());

describe("one photo to eBay", () => {
  it("posts the file as 'image' to createImageFromFile with the seller's token", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://apim.ebay.com/commerce/media/v1_beta/image/create_image_from_file");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      const form = init.body as FormData;
      const file = form.get("image") as File;
      expect(file).toBeTruthy();
      expect(file.name).toBe("2026-11-01-2-COG4-1.jpg");
      expect(file.type).toBe("image/jpeg");
      return new Response(
        JSON.stringify({ imageUrl: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg", expirationDate: "2026-12-01T00:00:00Z" }),
        { status: 201 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    expect(await uploadPhoto("tok", jpeg, "image/jpeg", "2026-11-01-2-COG4-1.jpg")).toEqual({
      url: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("a refusal comes back in eBay's words", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ errors: [{ errorId: 190203, message: "The image format is not supported." }] }),
          { status: 400 },
        ),
      ),
    );
    expect(await uploadPhoto("tok", jpeg, "image/jpeg", "x.jpg")).toEqual({
      error: "eBay said (HTTP 400, error 190203): The image format is not supported.",
    });
  });
  it("a network failure says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("socket hang up"); }));
    expect(await uploadPhoto("tok", jpeg, "image/jpeg", "x.jpg")).toEqual({
      error: "could not reach eBay (socket hang up)",
    });
  });
});

describe("a batch of photos", () => {
  it("keeps the order and names each refused photo with eBay's reason", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const name = ((init.body as FormData).get("image") as File).name;
        n++;
        if (name.endsWith("-6.jpg"))
          return new Response(JSON.stringify({ errors: [{ errorId: 190013, message: "Unauthorized access." }] }), { status: 403 });
        return new Response(JSON.stringify({ imageUrl: `https://i.ebayimg.com/${name}` }), { status: 201 });
      }),
    );
    const images = [1, 2, 3].map(() => ({ mediaType: "image/jpeg", data: jpeg }));
    const r = await uploadPhotos("tok", images, "SKU", 4);
    expect(n).toBe(3);
    expect(r.urls).toEqual(["https://i.ebayimg.com/SKU-5.jpg", "https://i.ebayimg.com/SKU-7.jpg"]);
    expect(r.errors).toEqual(["Photo 6: eBay said (HTTP 403, error 190013): Unauthorized access."]);
  });
});
