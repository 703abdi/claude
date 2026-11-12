import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfDayInTz } from "@/lib/day";
import { getFeedEvents } from "@/lib/calendar-feeds";
import { resolveTz } from "@/lib/hub-data";
import { scheduleBackgroundSyncs } from "@/lib/background-sync";
import { AHEAD_DAYS, buildBriefing, type BriefEventIn, type Briefing } from "./briefing";

function firstName(name: string | null | undefined, email: string) {
  const first = name?.trim().split(/\s+/)[0];
  const raw = first || (email.split("@")[0] ?? "").replace(/[^a-zA-Z]/g, "") || "there";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Reads the database right now and builds the Home briefing. Nothing is cached: every
 * open and every poll reflects the current rows. Sources (Google, Calendly, Fathom) are
 * pulled after the response, so anything new shows on the next poll. */
export async function getBriefing(opts: { tz?: string | null; sync?: boolean } = {}): Promise<Briefing & { sources: { name: string; ok: boolean; lastSyncAt: string | null; error: string | null }[] }> {
  const tz = await resolveTz(opts.tz);
  const now = new Date();
  const startToday = startOfDayInTz(now, tz);
  if (opts.sync !== false) scheduleBackgroundSyncs(tz);

  const [user, eventRows, waitingRows, feed, syncRows] = await Promise.all([
    prisma.user.findFirst({ select: { name: true, email: true } }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: new Date(startToday.getTime() - 3 * 86_400_000), lt: new Date(startToday.getTime() + (AHEAD_DAYS + 2) * 86_400_000) } },
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
    prisma.syncSource.findMany({ where: { name: { in: ["google", "calendly", "fathom"] } }, select: { name: true, lastSyncAt: true, lastSyncStatus: true, lastSyncError: true, enabled: true } }),
  ]);

  const events: BriefEventIn[] = [
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

  const briefing = buildBriefing({ now, tz, name: firstName(user?.name, user?.email ?? ""), events, waiting });
  const sources = syncRows.map((s) => ({
    name: s.name,
    ok: s.lastSyncStatus !== "error",
    lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
    error: s.lastSyncError ?? null,
  }));
  return { ...briefing, sources };
}

/** The briefing as plain text for the model: short, factual, nothing it has to guess. */
export function briefingAsContext(b: Briefing) {
  const ev = (l: Briefing["today"][number]) => `- ${l.dayLabel}${l.time ? ` ${l.time}` : " (all day)"}: ${l.title}${l.person ? ` (with ${l.person})` : ""}${l.location ? ` @ ${l.location}` : ""}`;
  return [
    `Now: ${b.generatedAt}`,
    `Today:\n${b.today.map(ev).join("\n") || "- nothing left today"}`,
    `Next 7 days:\n${b.ahead.map(ev).join("\n") || "- nothing"}`,
    `Recorded calls, last 48h:\n${b.calls.map((c) => `- ${c.when}: ${c.title}${c.person ? ` (with ${c.person})` : ""}`).join("\n") || "- none"}`,
    `Waiting on:\n${b.waiting.map((w) => `- ${w.person} (${w.days}d): ${w.items.join("; ")}`).join("\n") || "- nobody"}`,
  ].join("\n\n");
}
