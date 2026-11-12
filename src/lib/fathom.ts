import { prisma } from "@/lib/prisma";
import { notePerson } from "@/lib/people-auto";
import { logSignal } from "@/lib/signals";
import { clockInTz, dayKey, startOfDayInTz } from "@/lib/day";

/** Fathom call recorder -> the calendar. Every recorded call attaches its recording link to
 * the calendar event it belongs to (same day, closest start, within 90 minutes), or becomes
 * its own read-only event when nothing matches. It makes no tasks and posts nothing to a feed
 * (Abdi, Nov 12 2026: the auto-made tasks were stale noise). The people on the call are still
 * noted. Needs FATHOM_API_KEY (Fathom: Settings -> API). Throttled to one pull every 5
 * minutes, tracked in SyncSource MANUAL/"fathom". */

const API = "https://api.fathom.ai/external/v1/meetings";
const SOURCE = { type: "MANUAL" as const, name: "fathom" };
const THROTTLE_MS = 5 * 60_000;
const MATCH_WINDOW_MIN = 90;
const FIRST_RUN_DAYS = 3;
const MAX_PAGES = 5;

type Invitee = { name: string | null; email: string | null; is_external?: boolean };
type ActionItem = {
  description: string;
  completed: boolean;
  user_generated?: boolean;
  recording_timestamp?: string;
  recording_playback_url?: string;
  assignee?: { name?: string | null; email?: string | null } | null;
};
type Meeting = {
  title: string | null;
  meeting_title?: string | null;
  recording_id: number;
  url: string;
  share_url: string;
  created_at: string;
  scheduled_start_time?: string | null;
  recording_start_time?: string | null;
  recorded_by?: { name?: string | null; email?: string | null } | null;
  calendar_invitees?: Invitee[];
  action_items?: ActionItem[];
};

/** FATHOM_API_KEY, or fathom_key (the name Abdi used in Vercel). */
function apiKey() {
  return (process.env.FATHOM_API_KEY ?? process.env.fathom_key ?? process.env.FATHOM_KEY ?? "").trim();
}

export function fathomConfigured() {
  return apiKey().length > 0;
}

export async function fathomStatus() {
  const row = await prisma.syncSource.findUnique({ where: { type_name: SOURCE } });
  return {
    configured: fathomConfigured(),
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row?.lastSyncStatus ?? null,
    lastSyncError: row?.lastSyncError ?? null,
  };
}

async function fetchMeetings(createdAfter: Date): Promise<Meeting[]> {
  const key = apiKey();
  const out: Meeting[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const u = new URL(API);
    u.searchParams.set("include_action_items", "true");
    u.searchParams.set("created_after", createdAfter.toISOString());
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) throw new Error("Fathom rejected the API key. Check FATHOM_API_KEY in Vercel.");
    if (!res.ok) throw new Error(`Fathom answered ${res.status}`);
    const json = (await res.json()) as { items?: Meeting[]; next_cursor?: string | null };
    out.push(...(json.items ?? []));
    cursor = json.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

/** "Lavender Smith" -> "Lavender Smith"; drops emails, lone initials and junk. */
function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.replace(/\(.*?\)/g, "").replace(/[^\p{L}\p{M}' .-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!n || n.includes("@") || n.length < 3 || n.length > 60) return null;
  if (/^(guest|unknown|user|meet|zoom|phone)$/i.test(n)) return null;
  return n
    .split(" ")
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function isMe(a: ActionItem["assignee"], myEmail: string | null, myName: string | null) {
  if (!a) return true; // unassigned items are yours to triage
  const email = a.email?.toLowerCase() ?? "";
  const name = a.name?.toLowerCase() ?? "";
  if (myEmail && email && email === myEmail.toLowerCase()) return true;
  if (myName && name && name.includes(myName.toLowerCase())) return true;
  return name.includes("abdi");
}

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Which of the day's events a call belongs to: closest start within the window, else none. Pure. */
export function matchCallToEvent<T extends { id: string; startTime: string | null; recordingUrl: string | null }>(
  callClock: string,
  dayEvents: T[],
  windowMin = MATCH_WINDOW_MIN
): T | null {
  const at = minutesOf(callClock);
  let best: { ev: T; gap: number } | null = null;
  for (const ev of dayEvents) {
    if (!ev.startTime || ev.recordingUrl) continue;
    const gap = Math.abs(minutesOf(ev.startTime) - at);
    if (gap <= windowMin && (!best || gap < best.gap)) best = { ev, gap };
  }
  return best?.ev ?? null;
}

export async function syncFathom(opts: { force?: boolean; tz?: string } = {}) {
  if (!fathomConfigured()) return { skipped: "not configured" as const };
  const row = await prisma.syncSource.upsert({
    where: { type_name: SOURCE },
    update: {},
    create: { ...SOURCE, enabled: true },
  });
  if (!opts.force && row.lastSyncAt && Date.now() - row.lastSyncAt.getTime() < THROTTLE_MS) {
    return { skipped: "recent" as const };
  }

  const since = row.lastSyncAt ? new Date(row.lastSyncAt.getTime() - 86_400_000) : new Date(Date.now() - FIRST_RUN_DAYS * 86_400_000);
  const user = await prisma.user.findFirst({ select: { email: true, name: true, timezone: true } });
  const tz = opts.tz ?? user?.timezone ?? "America/New_York";
  const people = await prisma.person.findMany({ select: { id: true, name: true } });

  /** Tracked person by name, or a sighting that becomes a Person after enough calls (see people-auto). */
  async function personFor(rawName: string | null | undefined, note: string, email: string | null | undefined, ref: string) {
    const name = cleanName(rawName);
    if (!name && !email) return null;
    if (isMe({ name, email }, user?.email ?? null, user?.name ?? null)) return null;
    return notePerson({ name, email: email ?? null, ref, source: "fathom", note }, people);
  }

  let attached = 0;
  let created = 0;
  try {
    const meetings = await fetchMeetings(since);
    for (const m of meetings) {
      const link = m.share_url || m.url;
      if (!link) continue;
      const externalId = `fathom:${m.recording_id}`;
      const title = m.title || m.meeting_title || "Call";
      const when = new Date(m.recording_start_time || m.scheduled_start_time || m.created_at);
      const external = (m.calendar_invitees ?? []).filter((i) => i.is_external !== false && (i.name || i.email));
      let callPerson: { id: string; name: string } | null = null;
      for (const i of external) {
        const p = await personFor(i.name, `Met on a recorded call, ${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`, i.email, externalId);
        if (p && !callPerson) callPerson = p;
      }

      // Already placed on an earlier pull?
      const placed = await prisma.calendarEvent.findFirst({ where: { OR: [{ externalId }, { recordingUrl: link }] }, select: { id: true } });
      if (placed) continue;

      const dayStart = startOfDayInTz(when, tz);
      const sameDay = (
        await prisma.calendarEvent.findMany({
          where: { date: { gte: new Date(dayStart.getTime() - 12 * 3_600_000), lt: new Date(dayStart.getTime() + 36 * 3_600_000) } },
          select: { id: true, date: true, startTime: true, recordingUrl: true, personId: true },
        })
      ).filter((e) => dayKey(e.date, tz) === dayKey(when, tz));
      const clock = clockInTz(when, tz);
      const match = matchCallToEvent(clock, sameDay);
      if (match) {
        await prisma.calendarEvent.update({
          where: { id: match.id },
          data: { recordingUrl: link, personId: match.personId ?? callPerson?.id ?? null },
        });
        attached++;
      } else {
        await prisma.calendarEvent.create({
          data: { title: title.slice(0, 200), date: when, startTime: clock, allDay: false, source: "fathom", externalId, recordingUrl: link, personId: callPerson?.id ?? null },
        });
        created++;
      }
    }
    await prisma.syncSource.update({
      where: { type_name: SOURCE },
      data: { lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    });
    void logSignal("sync", { source: "fathom", data: { attached, created } });
    return { calls: attached + created, attached, created };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fathom sync failed";
    void logSignal("sync", { source: "fathom", data: { error: message } });
    await prisma.syncSource.update({
      where: { type_name: SOURCE },
      data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message },
    });
    return { error: message };
  }
}
