import { NextRequest, NextResponse } from "next/server";
import { guardCloudRequest, safeErrorResponse } from "@/lib/api-guard";
import { cloudStatus } from "@/lib/cloud/config";
import { K, redis } from "@/lib/cloud/redis";

export const dynamic = "force-dynamic";

// The lister's records in the cloud (11 Nov 2026): every key the browser keeps
// in its drafts database — the work screen, History cards, learned marks and
// tags — mirrored one key at a time, with a revision per key so each device
// only fetches what changed.
//
//   { action: "status" }                → which halves of the cloud are on
//   { action: "revs" }                  → { revs: { key: "ms" | "-ms" } }
//   { action: "get", keys }             → { values: { key: json | null } }
//   { action: "put", items: [{key, value}] } → { revs }
//   { action: "delete", keys }          → { revs }

const MAX_KEYS = 500;
const KEY_RE = /^[\w:.\-]{1,200}$/;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  const denied = guardCloudRequest(req);
  if (denied) return denied;

  let body: { action?: string; keys?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request.");
  }
  if (body.action === "status") return NextResponse.json({ ok: true, ...cloudStatus() });

  const r = redis();
  if (!r) return NextResponse.json({ ok: false, code: "CLOUD_OFF", error: "Cloud storage is not connected." }, { status: 503 });

  try {
    if (body.action === "revs") {
      const revs = ((await r.hgetall(K.rev)) ?? {}) as Record<string, string>;
      return NextResponse.json({ ok: true, revs });
    }

    if (body.action === "get") {
      const keys = Array.isArray(body.keys) ? body.keys.map(String) : [];
      if (!keys.length) return NextResponse.json({ ok: true, values: {} });
      if (keys.length > MAX_KEYS || !keys.every((k) => KEY_RE.test(k))) return bad("Bad keys.");
      const got = (await r.hmget(K.rec, ...keys)) as Record<string, string | null> | null;
      return NextResponse.json({ ok: true, values: got ?? {} });
    }

    if (body.action === "put") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return NextResponse.json({ ok: true, revs: {} });
      if (items.length > MAX_KEYS) return bad("Too many records at once.");
      const rec: Record<string, string> = {};
      const revs: Record<string, string> = {};
      let n = Date.now();
      for (const it of items as { key?: unknown; value?: unknown }[]) {
        const key = String(it?.key ?? "");
        if (!KEY_RE.test(key) || typeof it?.value !== "string") return bad("Bad record.");
        rec[key] = it.value;
        revs[key] = String(n++); // strictly increasing within one write
      }
      const p = r.pipeline();
      p.hset(K.rec, rec);
      p.hset(K.rev, revs);
      await p.exec();
      return NextResponse.json({ ok: true, revs });
    }

    if (body.action === "delete") {
      const keys = Array.isArray(body.keys) ? body.keys.map(String) : [];
      if (!keys.length) return NextResponse.json({ ok: true, revs: {} });
      if (keys.length > MAX_KEYS || !keys.every((k) => KEY_RE.test(k))) return bad("Bad keys.");
      const revs: Record<string, string> = {};
      let n = Date.now();
      for (const k of keys) revs[k] = `-${n++}`;
      const p = r.pipeline();
      p.hdel(K.rec, ...keys);
      p.hset(K.rev, revs);
      await p.exec();
      return NextResponse.json({ ok: true, revs });
    }

    return bad("Unknown action.");
  } catch (e) {
    return safeErrorResponse("cloud/records", e, "Cloud storage did not answer. Your work is still saved on this device.");
  }
}
