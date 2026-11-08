import ical, { type VEvent } from "node-ical";
import { prisma } from "@/lib/prisma";
import type { CalendarEvent } from "@/lib/types";
import { dayKey, clockInTz, zonedTime } from "@/lib/day";

/** Read-only calendar feeds (Google Calendar "secret address in iCal format", Calendly, Apple
 * public calendars). Saved in SyncSource type CALENDAR / name "ics" as { urls: string[] }.
 * Fetched server side, cached 5 minutes, recurring events expanded for a rolling window. */

const FEED_NAME = "ics";
const CACHE_MS = 5 * 60_000;
const PAST_DAYS = 7;
const FUTURE_DAYS = 45;

type FeedConfig = { urls: string[] };

export async function getFeedUrls(): Promise<string[]> {
  const row = await prisma.syncSource.findUnique({ where: { type_name: { type: "CALENDAR", name: FEED_NAME } } });
  const cfg = (row?.config ?? null) as FeedConfig | null;
  return Array.isArray(cfg?.urls) ? cfg!.urls.filter((u) => typeof u === "string" && u.trim()) : [];
}

export async function setFeedUrls(urls: string[]) {
  const clean = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  await prisma.syncSource.upsert({
    where: { type_name: { type: "CALENDAR", name: FEED_NAME } },
    update: { config: { urls: clean }, enabled: clean.length > 0 },
    create: { type: "CALENDAR", name: FEED_NAME, config: { urls: clean }, enabled: clean.length > 0 },
  });
  cache = null;
  return clean;
}

/** Hide the secret part of a feed URL for display. */
export function maskFeedUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.host}/…${u.pathname.slice(-14)}`;
  } catch {
    return url.slice(0, 24) + "…";
  }
}

let cache: { at: number; key: string; events: CalendarEvent[]; errors: string[] } | null = null;

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "val" in (v as Record<string, unknown>)) return String((v as { val: unknown }).val ?? "");
  return String(v);
}

function toEvent(uid: string, start: Date, end: Date | null, allDay: boolean, ev: VEvent, tz: string, feedIndex: number): CalendarEvent {
  const date = allDay ? zonedTime(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), 12, 0, tz) : start;
  const stamp = allDay ? dayKey(date, tz) : start.toISOString();
  return {
    id: `ics:${feedIndex}:${uid}:${stamp}`,
    title: text(ev.summary) || "(no title)",
    date: date.toISOString(),
    startTime: allDay ? null : clockInTz(start, tz),
    endTime: allDay || !end ? null : clockInTz(end, tz),
    allDay,
    location: text(ev.location) || null,
    notes: text(ev.description) || null,
    category: null,
    task: null,
    person: null,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    source: "feed",
    readOnly: true,
  };
}

async function fetchFeed(url: string, index: number, tz: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "abdis-os/1.0" } });
  if (!res.ok) throw new Error(`feed ${index + 1} answered ${res.status}`);
  const body = await res.text();
  const parsed = ical.parseICS(body);
  const out: CalendarEvent[] = [];
  for (const [uid, comp] of Object.entries(parsed)) {
    if (!comp || (comp as { type?: string }).type !== "VEVENT") continue;
    const ev = comp as VEvent;
    if (String((ev as { status?: unknown }).status ?? "").toUpperCase() === "CANCELLED") continue;
    try {
      const instances = ical.expandRecurringEvent(ev, { from, to, maxIterations: 2000 });
      for (const inst of instances) {
        const s = inst.start as Date;
        const e = inst.end as Date | undefined;
        if (!(s instanceof Date) || Number.isNaN(s.getTime())) continue;
        out.push(toEvent(uid, s, e instanceof Date ? e : null, inst.isFullDay, inst.event ?? ev, tz, index));
      }
    } catch {
      // one bad rule should not sink the feed
    }
  }
  return out;
}

export async function getFeedEvents(tz: string): Promise<{ events: CalendarEvent[]; errors: string[]; count: number }> {
  const urls = await getFeedUrls();
  if (urls.length === 0) return { events: [], errors: [], count: 0 };
  const key = `${tz}|${urls.join("|")}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return { events: cache.events, errors: cache.errors, count: urls.length };

  const now = Date.now();
  const from = new Date(now - PAST_DAYS * 86_400_000);
  const to = new Date(now + FUTURE_DAYS * 86_400_000);
  const errors: string[] = [];
  const settled = await Promise.allSettled(urls.map((u, i) => fetchFeed(u, i, tz, from, to)));
  const events: CalendarEvent[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") events.push(...r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : `feed ${i + 1} failed`);
  });
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  cache = { at: Date.now(), key, events, errors };
  await prisma.syncSource
    .update({
      where: { type_name: { type: "CALENDAR", name: FEED_NAME } },
      data: { lastSyncAt: new Date(), lastSyncStatus: errors.length ? "error" : "success", lastSyncError: errors.join("; ") || null },
    })
    .catch(() => null);
  return { events, errors, count: urls.length };
}
