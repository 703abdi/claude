import { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfDayInTz } from "@/lib/day";
import { resolveTz } from "@/lib/hub-data";
import { getFeedEvents } from "@/lib/calendar-feeds";
import { syncFathom } from "@/lib/fathom";
import { syncCalendly } from "@/lib/calendly";
import { syncGoogle } from "@/lib/google";
import { sendPush } from "@/lib/push";
import { searchMemory } from "@/lib/memory";
import { dueNudges, type Nudge, type NudgeEventIn } from "./nudge-rules";

/** The tick: pull the sources, work out which nudges are due, store each one once and
 * push it to the phone. Called every few minutes by the Mac, a cron or GitHub Actions. */

const SYNC_CAP_MS = 20_000;
const KEEP_DAYS = 14;
const LIST_HOURS = 36;
const LIST_MAX = 8;

function firstName(name: string | null | undefined, email: string) {
  const first = name?.trim().split(/\s+/)[0];
  const raw = first || (email.split("@")[0] ?? "").replace(/[^a-zA-Z]/g, "") || "there";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Runs the three source pulls, but never waits longer than the cap. Each pull keeps its own throttle. */
async function syncSources(tz: string) {
  const all = Promise.all([
    syncFathom({ tz }).catch(() => null),
    syncCalendly({ tz }).catch(() => null),
    syncGoogle({ tz }).catch(() => null),
  ]).then(() => "done" as const);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), SYNC_CAP_MS);
  });
  const result = await Promise.race([all, cap]);
  if (timer) clearTimeout(timer);
  return result;
}

function clip(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

/** Adds what is known about the person to a pre-call nudge: their notes, the last
 * recorded call, and the best memory match for their name. Any failure leaves the body as it was. */
async function enrichPrecall(n: Nudge, now: Date): Promise<string> {
  const person = n.person;
  if (!person) return n.body;
  const parts = [n.body];
  try {
    if (person.id) {
      const [row, lastCall] = await Promise.all([
        prisma.person.findUnique({ where: { id: person.id }, select: { notes: true } }),
        prisma.calendarEvent.findFirst({
          where: { personId: person.id, recordingUrl: { not: null }, date: { lt: now } },
          orderBy: { date: "desc" },
          select: { title: true, date: true },
        }),
      ]);
      if (row?.notes?.trim()) parts.push(`Notes: ${clip(row.notes, 200)}`);
      if (lastCall) parts.push(`Last call: ${lastCall.title}, ${lastCall.date.toISOString().slice(0, 10)}.`);
    }
  } catch {
    // Keep going without the person details.
  }
  try {
    const [hit] = await searchMemory(person.name, { limit: 1 });
    if (hit) parts.push(`From memory: ${hit.title}${hit.snippet ? `. ${clip(hit.snippet, 160)}` : ""}`);
  } catch {
    // Memory search is optional.
  }
  return parts.filter(Boolean).join("\n");
}

export async function runTick(opts: { tz?: string | null } = {}): Promise<{ created: string[]; pushed: number; synced: "done" | "timeout"; removed: number }> {
  const tz = await resolveTz(opts.tz);
  const synced = await syncSources(tz);

  const now = new Date();
  const startToday = startOfDayInTz(now, tz);
  const removed = await prisma.jarvisNudge
    .deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86_400_000) } } })
    .then((r) => r.count)
    .catch(() => 0);

  const [user, eventRows, waitingRows, feed] = await Promise.all([
    prisma.user.findFirst({ select: { name: true, email: true, morningBriefTime: true } }),
    prisma.calendarEvent.findMany({
      // Yesterday (for a late call that ended in the last 6 hours) through the end of tomorrow.
      where: { date: { gte: new Date(startToday.getTime() - 86_400_000), lt: new Date(startToday.getTime() + 3 * 86_400_000) } },
      include: { person: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.task.findMany({
      where: { status: TaskStatus.WAITING },
      select: {
        title: true,
        waitingAt: true,
        updatedAt: true,
        followUpPerson: { select: { id: true, name: true } },
        people: { select: { person: { select: { id: true, name: true } } } },
      },
    }),
    getFeedEvents(tz).catch(() => ({ events: [], errors: [] as string[], count: 0 })),
  ]);

  const events: NudgeEventIn[] = [
    ...eventRows.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
      location: e.location,
      source: e.source,
      recordingUrl: e.recordingUrl,
      person: e.person,
    })),
    ...feed.events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
      location: e.location,
      source: e.source ?? "feed",
      person: null,
    })),
  ];

  const waiting = waitingRows
    .map((t) => {
      const p = t.followUpPerson ?? t.people[0]?.person ?? null;
      return p ? { personId: p.id, person: p.name, title: t.title, since: t.waitingAt ?? t.updatedAt } : null;
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  const due = dueNudges({
    now,
    tz,
    morningTime: user?.morningBriefTime ?? "06:00",
    name: firstName(user?.name, user?.email ?? ""),
    events,
    waiting,
  });
  if (due.length === 0) return { created: [], pushed: 0, synced, removed };

  // Skip the ones already stored before doing any extra work for them.
  const existing = new Set(
    (await prisma.jarvisNudge.findMany({ where: { key: { in: due.map((n) => n.key) } }, select: { key: true } })).map((r) => r.key)
  );

  const created: string[] = [];
  let pushed = 0;
  for (const n of due) {
    if (existing.has(n.key)) continue;
    const body = n.kind === "precall" ? await enrichPrecall(n, now) : n.body;
    let row;
    try {
      // The unique key is the lock: if two ticks race, the second insert fails here and sends nothing.
      row = await prisma.jarvisNudge.create({ data: { kind: n.kind, key: n.key, title: n.title, body, url: n.url } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    created.push(n.key);
    const res = await sendPush({ title: n.title, body, url: n.url ?? undefined, tag: n.kind }).catch(() => ({ sent: 0, removed: 0, failed: 0 }));
    if (res.sent > 0) {
      pushed++;
      await prisma.jarvisNudge.update({ where: { id: row.id }, data: { pushedAt: new Date() } }).catch(() => null);
    }
  }
  return { created, pushed, synced, removed };
}

export type NudgeView = { id: string; kind: string; title: string; body: string; url: string | null; createdAt: string };

/** Nudges not dismissed yet from the last 36 hours, newest first. */
export async function listNudges(): Promise<NudgeView[]> {
  const rows = await prisma.jarvisNudge.findMany({
    where: { dismissedAt: null, createdAt: { gte: new Date(Date.now() - LIST_HOURS * 3_600_000) } },
    orderBy: { createdAt: "desc" },
    take: LIST_MAX,
    select: { id: true, kind: true, title: true, body: true, url: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Hides one nudge. Returns false when there is no nudge with that id. */
export async function dismissNudge(id: string): Promise<boolean> {
  const res = await prisma.jarvisNudge.updateMany({ where: { id }, data: { dismissedAt: new Date() } });
  return res.count > 0;
}
