import { NextRequest, NextResponse } from "next/server";
import { del, get, put } from "@vercel/blob";
import { guardCloudRequest, safeErrorResponse } from "@/lib/api-guard";
import { blobConfigured, OWNER } from "@/lib/cloud/config";
import { K, redis } from "@/lib/cloud/redis";

export const dynamic = "force-dynamic";

// Photos in the cloud (11 Nov 2026): the eBay-size copy of each photo
// (≤ 2400 px JPEG, ≤ ~2 MB) in a PRIVATE Vercel Blob store — no public link,
// read only through this route with the access code.
//
//   POST   body = JPEG bytes, ?id=<photo id>   → store it (one write per photo)
//   GET    ?id=<photo id>                      → the JPEG
//   DELETE body { keep: [ids] }                → remove photos no record uses
//                                                any more (older than a week)

const ID_RE = /^[\w\-]{6,80}$/;
const MAX_BYTES = 4_000_000;
const path = (id: string) => `${OWNER}/p/${id}.jpg`;

function off() {
  return NextResponse.json({ ok: false, code: "CLOUD_OFF", error: "Photo storage is not connected." }, { status: 503 });
}

export async function POST(req: NextRequest) {
  const denied = guardCloudRequest(req);
  if (denied) return denied;
  if (!blobConfigured()) return off();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, error: "Bad photo id." }, { status: 400 });
  try {
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES)
      return NextResponse.json({ ok: false, error: "Photo is too large." }, { status: 413 });
    await put(path(id), Buffer.from(bytes), {
      access: "private",
      contentType: "image/jpeg",
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    await redis()?.hset(K.photos, { [id]: String(Date.now()) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return safeErrorResponse("cloud/photo:put", e, "The photo could not be saved to the cloud.");
  }
}

export async function GET(req: NextRequest) {
  const denied = guardCloudRequest(req);
  if (denied) return denied;
  if (!blobConfigured()) return off();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, error: "Bad photo id." }, { status: 400 });
  try {
    const got = await get(path(id), { access: "private" });
    if (!got || !("stream" in got) || !got.stream)
      return NextResponse.json({ ok: false, error: "Photo not found." }, { status: 404 });
    return new Response(got.stream as ReadableStream, {
      headers: {
        "content-type": "image/jpeg",
        // A photo never changes under its id; the browser may keep it.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return safeErrorResponse("cloud/photo:get", e, "The photo could not be read from the cloud.");
  }
}

export async function DELETE(req: NextRequest) {
  const denied = guardCloudRequest(req);
  if (denied) return denied;
  if (!blobConfigured()) return off();
  const r = redis();
  if (!r) return off();
  try {
    const body = await req.json().catch(() => ({}));
    const keep = new Set<string>(Array.isArray(body?.keep) ? body.keep.map(String) : []);
    const stored = ((await r.hgetall(K.photos)) ?? {}) as Record<string, string>;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; // a photo just added elsewhere is never taken
    const gone = Object.entries(stored)
      .filter(([id, at]) => !keep.has(id) && Number(at) < weekAgo)
      .map(([id]) => id);
    if (gone.length) {
      await del(gone.map(path)); // deletes are free on Vercel Blob
      await r.hdel(K.photos, ...gone);
    }
    return NextResponse.json({ ok: true, removed: gone.length });
  } catch (e) {
    return safeErrorResponse("cloud/photo:gc", e, "Old photos could not be cleaned up.");
  }
}
