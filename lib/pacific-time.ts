// eBay shows scheduled listings in Pacific time (PST/PDT), so the seller picks
// the start in Pacific time too, wherever she is (Moscow, New York — 11 Nov 2026).

const ZONE = "America/Los_Angeles";

/** Minutes Pacific time is behind UTC at this moment (480 in winter, 420 in summer). */
function pacificOffsetMinutes(at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(at));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  return Math.round((at - asUtc) / 60_000);
}

/** "2026-11-20T09:30" read as Pacific time → an exact moment (ISO, UTC). */
export function pacificToIso(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("Choose a date and a time.");
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Guess with the offset at that moment, then correct once around a DST change.
  let t = naive + pacificOffsetMinutes(naive) * 60_000;
  t = naive + pacificOffsetMinutes(t) * 60_000;
  return new Date(t).toISOString();
}

/** An exact moment shown as Pacific time, "Nov 20, 9:30 AM PST". */
export function showPacific(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
