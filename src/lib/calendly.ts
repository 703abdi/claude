import { prisma } from "@/lib/prisma";
import { clockInTz, dayKey, utcDateFromKey } from "@/lib/day";
import { matchPeople } from "@/lib/quick-add-parse";

/** Calendly -> the OS. Every booked call becomes a calendar event (read-only, linked to the
 * invitee as a person), a new booking adds one to "booked" on the scoreboard for the day it
 * was booked and posts to the feed, and a cancellation removes the event and posts too.
 * Needs CALENDLY_TOKEN (Calendly: Integrations, API and webhooks, personal access token).
 * Throttled to one pull every 15 minutes, tracked in SyncSource MANUAL/"calendly". */

const API = process.env.CALENDLY_API_BASE ?? "https://api.calendly.com"; // override only for local tests
const SOURCE = { type: "MANUAL" as const, name: "calendly" };
const THROTTLE_MS = 15 * 60_000;
const PAST_DAYS = 7;
const FUTURE_DAYS = 45;
const MAX_PAGES = 5;

type CalendlyEvent = {
  uri: string;
  name: string | null;
  status: "active" | "canceled";
  start_time: string;
  end_time: string;
  created_at: string;
  location?: { type?: string; location?: string | null; join_url?: string | null } | null;
  cancellation?: { canceled_by?: string; reason?: string | null } | null;
};
type Invitee = {
  name: string | null;
  email: string | null;
  status: "active" | "canceled";
  timezone?: string | null;
  questions_and_answers?: { question: string; answer: string }[];
};
type Config = { userUri?: string; counted?: string[] };

function token() {
  return (process.env.CALENDLY_TOKEN ?? process.env.calendly_token ?? "").trim();
}

export function calendlyConfigured() {
  return token().length > 0;
}

export async function calendlyStatus() {
  const row = await prisma.syncSource.findUnique({ where: { type_name: SOURCE } });
  return {
    configured: calendlyConfigured(),
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row?.lastSyncStatus ?? null,
    lastSyncError: row?.lastSyncError ?? null,
  };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Calendly rejected the token. Check CALENDLY_TOKEN in Vercel.");
  if (!res.ok) throw new Error(`Calendly answered ${res.status}`);
  return (await res.json()) as T;
}

async function listEvents(userUri: string, from: Date, to: Date): Promise<CalendlyEvent[]> {
  const out: CalendlyEvent[] = [];
  let next: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const u = new URL(`${API}/scheduled_events`);
    u.searchParams.set("user", userUri);
    u.searchParams.set("min_start_time", from.toISOString());
    u.searchParams.set("max_start_time", to.toISOString());
    u.searchParams.set("count", "100");
    u.searchParams.set("sort", "start_time:asc");
    if (next) u.searchParams.set("page_token", next);
    const json: { collection: CalendlyEvent[]; pagination?: { next_page_token?: string | null } } = await get(u.toString());
    out.push(...json.collection);
    next = json.pagination?.next_page_token ?? null;
    if (!next) break;
  }
  return out;
}

function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.replace(/[^\p{L}\p{M}' .-]/gu, " ").replace(/\s+/g, " ").trim();
  if (n.length < 2 || n.length > 60) return null;
  return n
    .split(" ")
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export async function syncCalendly(opts: { force?: boolean; tz?: string } = {}) {
  if (!calendlyConfigured()) return { skipped: "not configured" as const };
  const row = await prisma.syncSource.upsert({ where: { type_name: SOURCE }, update: {}, create: { ...SOURCE, enabled: true } });
  if (!opts.force && row.lastSyncAt && Date.now() - row.lastSyncAt.getTime() < THROTTLE_MS) return { skipped: "recent" as const };

  const tz = opts.tz ?? (await prisma.user.findFirst({ select: { timezone: true } }))?.timezone ?? "America/New_York";
  const cfg = ((row.config ?? {}) as Config) || {};
  const counted = new Set(cfg.counted ?? []);
  const people = await prisma.person.findMany({ select: { id: true, name: true } });

  let booked = 0;
  let canceled = 0;
  let updated = 0;
  try {
    if (!cfg.userUri) {
      const me: { resource: { uri: string } } = await get("/users/me");
      cfg.userUri = me.resource.uri;
    }
    const now = Date.now();
    const events = await listEvents(cfg.userUri, new Date(now - PAST_DAYS * 86_400_000), new Date(now + FUTURE_DAYS * 86_400_000));

    for (const ev of events) {
      const uuid = ev.uri.split("/").pop()!;
      const externalId = `calendly:${uuid}`;
      const existing = await prisma.calendarEvent.findUnique({ where: { externalId }, select: { id: true, title: true, personId: true } });

      if (ev.status === "canceled") {
        if (existing) {
          await prisma.calendarEvent.delete({ where: { id: existing.id } });
          await prisma.inboxItem.create({
            data: {
              agent: "calendly",
              kind: "update",
              title: `Canceled: ${existing.title}`,
              body: [new Date(ev.start_time).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), ev.cancellation?.reason || null]
                .filter(Boolean)
                .join(" · "),
            },
          });
          canceled++;
        }
        continue;
      }

      const invitees: { collection: Invitee[] } = await get(`/scheduled_events/${uuid}/invitees?status=active&count=10`);
      const inv = invitees.collection[0] ?? null;
      const name = cleanName(inv?.name);
      let person = name ? matchPeople(name.toLowerCase(), people) : null;
      if (!person && name) {
        const created = await prisma.person
          .create({ data: { name, notes: [inv?.email, "Booked a call through Calendly."].filter(Boolean).join("\n") } })
          .catch(() => null);
        if (created) {
          person = { id: created.id, name: created.name };
          people.push(person);
        }
      }

      const start = new Date(ev.start_time);
      const end = new Date(ev.end_time);
      const qa = (inv?.questions_and_answers ?? [])
        .filter((q) => q.answer?.trim())
        .map((q) => `${q.question}: ${q.answer.trim()}`)
        .join("\n");
      const title = name ? `${ev.name ?? "Call"} with ${name}` : ev.name ?? "Call";
      const data = {
        title,
        date: start,
        startTime: clockInTz(start, tz),
        endTime: clockInTz(end, tz),
        allDay: false,
        location: ev.location?.join_url ?? ev.location?.location ?? null,
        notes: [inv?.email ?? null, qa || null].filter(Boolean).join("\n\n") || null,
        personId: person?.id ?? null,
        source: "calendly",
        externalId,
      };
      if (existing) {
        await prisma.calendarEvent.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.calendarEvent.create({ data });
      }

      // One "booked" per booking, on the day it was booked, counted once ever.
      if (!counted.has(uuid)) {
        counted.add(uuid);
        const key = dayKey(new Date(ev.created_at), tz);
        const date = utcDateFromKey(key);
        await prisma.scoreEntry.upsert({ where: { date }, create: { date, booked: 1 }, update: { booked: { increment: 1 } } });
        await prisma.inboxItem.create({
          data: {
            agent: "calendly",
            kind: "update",
            title: `Booked: ${title}`,
            body: [start.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), inv?.email ?? null].filter(Boolean).join(" · "),
            link: ev.location?.join_url ?? null,
          },
        });
        booked++;
      }
    }

    await prisma.syncSource.update({
      where: { type_name: SOURCE },
      data: { config: { userUri: cfg.userUri, counted: [...counted].slice(-2000) }, lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    });
    return { booked, canceled, updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calendly sync failed";
    await prisma.syncSource.update({ where: { type_name: SOURCE }, data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message } });
    return { error: message };
  }
}
