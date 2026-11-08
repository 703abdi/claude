/** Timezone-aware day math. Works on the server (Vercel runs in UTC) and in the
 * browser. "Day keys" are YYYY-MM-DD strings in the given timezone. */

export const DEFAULT_TZ = "America/New_York";

export function safeTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function partsInTz(date: Date, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { y: out.year, m: out.month, d: out.day, h: out.hour % 24, mi: out.minute, s: out.second };
}

function offsetMs(date: Date, tz: string) {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant a wall-clock time happens in tz. */
export function zonedTime(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = offsetMs(new Date(guess), tz);
  let t = guess - off1;
  const off2 = offsetMs(new Date(t), tz);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

export function startOfDayInTz(date: Date, tz: string): Date {
  const p = partsInTz(date, tz);
  return zonedTime(p.y, p.m, p.d, 0, 0, tz);
}

export function dayKey(date: Date, tz: string): string {
  const p = partsInTz(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** UTC-midnight Date for a day key. Used for WeekPlan.weekStart and ScoreEntry.date. */
export function utcDateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function keyFromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const d = utcDateFromKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return keyFromUtcDate(d);
}

/** Day key of the Sunday that starts the week containing `date` (in tz). */
export function weekStartKey(date: Date, tz: string): string {
  const key = dayKey(date, tz);
  const dow = utcDateFromKey(key).getUTCDay();
  return addDaysKey(key, -dow);
}

/** "HH:mm" wall clock in tz. */
export function clockInTz(date: Date, tz: string): string {
  const p = partsInTz(date, tz);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}
