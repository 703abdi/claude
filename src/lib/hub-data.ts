import { createHash } from "crypto";
import { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { listAgents } from "@/lib/agents/list";
import { getLatestBrief } from "@/lib/morning-brief/latest";
import { fetchAbdiformMetrics } from "@/lib/abdiform";
import { getFeedEvents } from "@/lib/calendar-feeds";
import { syncFathom } from "@/lib/fathom";
import { syncCalendly } from "@/lib/calendly";
import { getPolicy } from "@/lib/policy";
import type { AbdiformResult } from "@/lib/abdiform-types";
import { AUTO_CLEAR_AFTER_DAYS } from "@/lib/task-dates";
import {
  addDaysKey,
  clockInTz,
  dayKey,
  keyFromUtcDate,
  safeTz,
  startOfDayInTz,
  utcDateFromKey,
  weekStartKey,
} from "@/lib/day";
import type { GoalView, HubPayload, InboxItem, Outcome, ScoreTotals, WaitingGroup } from "@/lib/hub-types";
import type { CalendarEvent } from "@/lib/types";

const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;

const SEEDED_OUTCOMES: Record<string, string[]> = {
  "2026-11-08": [
    "Lavender pilot signed and first payment collected",
    "Clear Line unblocked before Joaquin leaves Nov 12, baseline recorded",
    "Outbound running: lists built, dialing from Wed Nov 11, scoreboard tracked",
  ],
};

export async function resolveTz(requested?: string | null) {
  if (requested) return safeTz(requested);
  const user = await prisma.user.findFirst({ select: { timezone: true } });
  return safeTz(user?.timezone);
}

/** Idempotent: returns the plan for the week, creating it (seeded or empty) if missing. */
export async function ensureWeekPlan(weekKey: string) {
  const weekStart = utcDateFromKey(weekKey);
  const existing = await prisma.weekPlan.findUnique({ where: { weekStart } });
  if (existing) return existing;
  const outcomes: Outcome[] = (SEEDED_OUTCOMES[weekKey] ?? []).map((text) => ({ text, done: false }));
  try {
    return await prisma.weekPlan.create({ data: { weekStart, outcomes } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.weekPlan.findUniqueOrThrow({ where: { weekStart } });
    }
    throw err;
  }
}

export async function ensureGoal() {
  const existing = await prisma.goal.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.goal.create({
    data: {
      label: "Cash collected",
      targetCents: 2_000_000,
      startDate: utcDateFromKey("2026-11-01"),
      deadline: utcDateFromKey("2026-12-31"),
    },
  });
}

export function normalizeOutcomes(raw: unknown): Outcome[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is { text: unknown; done: unknown } => !!o && typeof o === "object")
    .map((o) => ({ text: String(o.text ?? ""), done: Boolean(o.done) }))
    .slice(0, 3);
}

const ZERO: ScoreTotals = { dials: 0, convos: 0, booked: 0, cashCents: 0 };

function sumScores(rows: ScoreTotals[]): ScoreTotals {
  return rows.reduce(
    (acc, r) => ({
      dials: acc.dials + r.dials,
      convos: acc.convos + r.convos,
      booked: acc.booked + r.booked,
      cashCents: acc.cashCents + r.cashCents,
    }),
    { ...ZERO }
  );
}

// abdiform is a remote call with a 10s timeout; the hub polls every 8s, so cache it.
let metricsCache: { at: number; value: AbdiformResult } | null = null;
async function cachedMetrics(): Promise<AbdiformResult> {
  if (metricsCache && Date.now() - metricsCache.at < 60_000) return metricsCache.value;
  const value = await fetchAbdiformMetrics();
  metricsCache = { at: Date.now(), value };
  return value;
}

export async function getHubData(opts: { tz?: string | null; lean?: boolean } = {}): Promise<HubPayload> {
  const tz = await resolveTz(opts.tz);
  const now = new Date();
  const todayKey = dayKey(now, tz);
  const startToday = startOfDayInTz(now, tz);
  const startTomorrow = startOfDayInTz(new Date(startToday.getTime() + 36 * 3_600_000), tz);
  const autoClearCutoff = startOfDayInTz(new Date(startToday.getTime() - AUTO_CLEAR_AFTER_DAYS * 86_400_000 + 12 * 3_600_000), tz);
  const weekKey = weekStartKey(now, tz);
  const weekEndKey = addDaysKey(weekKey, 6);
  const open = { status: { not: TaskStatus.COMPLETED } };

  // Pull Fathom before reading, so new action items are in this payload. Throttled to 30 min inside.
  if (!opts.lean) await Promise.all([syncFathom().catch(() => null), syncCalendly().catch(() => null)]);
  const [plan, goal] = await Promise.all([ensureWeekPlan(weekKey), ensureGoal()]);

  const [
    todayRows,
    eventRows,
    waitingRows,
    weekScores,
    cashAgg,
    openCount,
    overdueCount,
    dueTodayCount,
    waitingCount,
    doneTodayCount,
    inboxRows,
    categories,
    people,
    agents,
    brief,
    metrics,
    feed,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.WAITING] },
        OR: [{ pinnedToday: true }, { dueDate: { gte: autoClearCutoff, lt: startTomorrow } }],
      },
      include: taskInclude,
      orderBy: { position: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: new Date(startToday.getTime() - 86_400_000), lt: new Date(startToday.getTime() + 8 * 86_400_000) } },
      include: { category: true, person: true, task: { select: { id: true, title: true, status: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.task.findMany({
      where: { status: TaskStatus.WAITING },
      select: {
        id: true,
        title: true,
        waitingAt: true,
        followUpDate: true,
        updatedAt: true,
        followUpPerson: { select: { id: true, name: true } },
        people: { select: { person: { select: { id: true, name: true } } } },
      },
    }),
    prisma.scoreEntry.findMany({
      where: { date: { gte: utcDateFromKey(weekKey), lte: utcDateFromKey(weekEndKey) } },
    }),
    prisma.scoreEntry.aggregate({ where: { date: { gte: goal.startDate } }, _sum: { cashCents: true } }),
    prisma.task.count({ where: open }),
    prisma.task.count({ where: { ...open, dueDate: { lt: startToday } } }),
    prisma.task.count({ where: { ...open, dueDate: { gte: startToday, lt: startTomorrow } } }),
    prisma.task.count({ where: { status: TaskStatus.WAITING } }),
    prisma.task.count({ where: { status: TaskStatus.COMPLETED, completedAt: { gte: startToday } } }),
    prisma.inboxItem.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    opts.lean ? Promise.resolve({ agents: [], runs: [] }) : listAgents(),
    opts.lean ? Promise.resolve(null) : getLatestBrief(),
    opts.lean ? Promise.resolve({ configured: false } as AbdiformResult) : cachedMetrics(),
    getFeedEvents(tz).catch(() => ({ events: [] as CalendarEvent[], errors: [] as string[], count: 0 })),
  ]);

  // Today: overdue first, then pinned by position, then due today.
  const today = todayRows
    .map(serializeTask)
    .map((t) => ({ t, rank: t.overdue ? 0 : t.pinnedToday ? 1 : 2 }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.rank === 0) return (a.t.dueDate?.getTime() ?? 0) - (b.t.dueDate?.getTime() ?? 0);
      if (a.rank === 2) return (a.t.dueTime ?? "99").localeCompare(b.t.dueTime ?? "99") || a.t.position - b.t.position;
      return a.t.position - b.t.position;
    })
    .map((x) => x.t);

  // Up next: the next 4 events from now, within a week.
  const clock = clockInTz(now, tz);
  const ownEvents: CalendarEvent[] = json<CalendarEvent[]>(eventRows).map((e) => ({ ...e, source: e.source ?? null, readOnly: Boolean(e.source) }));
  const upNext = [...ownEvents, ...feed.events]
    .map((e) => ({ e, key: dayKey(new Date(e.date), tz) }))
    .filter(({ e, key }) => {
      if (key < todayKey) return false;
      if (key > todayKey) return true;
      const end = e.endTime ?? e.startTime;
      return e.allDay || !end || end >= clock;
    })
    .sort((a, b) => a.key.localeCompare(b.key) || (a.e.startTime ?? "").localeCompare(b.e.startTime ?? ""))
    .slice(0, 4)
    .map(({ e }) => e);

  // Waiting on: group WAITING tasks by person (linked people + follow-up person).
  const groups = new Map<string, WaitingGroup>();
  for (const t of waitingRows) {
    const persons = new Map<string, { id: string; name: string }>();
    for (const tp of t.people) persons.set(tp.person.id, tp.person);
    if (t.followUpPerson) persons.set(t.followUpPerson.id, t.followUpPerson);
    for (const p of persons.values()) {
      if (!groups.has(p.id)) groups.set(p.id, { person: p, tasks: [] });
      groups.get(p.id)!.tasks.push({
        id: t.id,
        title: t.title,
        waitingAt: (t.waitingAt ?? t.updatedAt).toISOString(),
        followUpDate: t.followUpDate?.toISOString() ?? null,
      });
    }
  }
  const oldest = (g: WaitingGroup) => Math.min(...g.tasks.map((t) => new Date(t.waitingAt ?? 0).getTime()));
  const waitingOn = [...groups.values()].sort((a, b) => oldest(a) - oldest(b));

  const todayScore = weekScores.find((s) => keyFromUtcDate(s.date) === todayKey);
  const deadlineKey = keyFromUtcDate(goal.deadline);
  const goalView: GoalView = {
    id: goal.id,
    label: goal.label,
    targetCents: goal.targetCents,
    startDate: keyFromUtcDate(goal.startDate),
    deadline: deadlineKey,
    collectedCents: cashAgg._sum.cashCents ?? 0,
    daysLeft: Math.max(0, Math.round((utcDateFromKey(deadlineKey).getTime() - utcDateFromKey(todayKey).getTime()) / 86_400_000)),
  };

  const inbox: InboxItem[] = inboxRows.map((i) => ({
    ...i,
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }));

  const { policy, version: policyVersion } = await getPolicy();
  const body = {
    tz,
    todayKey,
    policy,
    policyVersion,
    today: json<HubPayload["today"]>(today),
    upNext,
    feeds: { count: feed.count, errors: feed.errors },
    waitingOn,
    week: {
      weekStart: weekKey,
      weekEnd: weekEndKey,
      outcomes: normalizeOutcomes(plan.outcomes),
      scoreboard: {
        today: todayScore
          ? { dials: todayScore.dials, convos: todayScore.convos, booked: todayScore.booked, cashCents: todayScore.cashCents }
          : { ...ZERO },
        week: sumScores(weekScores),
      },
      goal: goalView,
    },
    stats: { open: openCount, overdue: overdueCount, dueToday: dueTodayCount, waiting: waitingCount, doneToday: doneTodayCount },
    agents,
    inbox,
    brief: json<HubPayload["brief"]>(brief),
    categories,
    people,
  };

  // Version = hash of everything that matters (not the clock, not remote metrics).
  const version = createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 12);

  return { now: now.toISOString(), version, metrics, ...body };
}

/** Compact, LLM-friendly snapshot for agents (GET /api/state). */
export async function getAgentState(tz?: string | null) {
  const hub = await getHubData({ tz, lean: true });
  const dollars = (c: number) => Math.round(c) / 100;
  const tasks = hub.today.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category?.name ?? null,
    due: t.dueDate ? dayKey(new Date(t.dueDate), hub.tz) : null,
    dueTime: t.dueTime,
    people: t.people.map((p) => p.name),
    pinned: t.pinnedToday,
    overdue: t.overdue,
    status: t.status,
  }));
  const end48 = Date.now() + 48 * 3_600_000;
  const upcoming = await prisma.calendarEvent.findMany({
    where: { date: { gte: startOfDayInTz(new Date(), hub.tz), lt: new Date(end48) } },
    include: { person: { select: { name: true } } },
    orderBy: { date: "asc" },
    take: 20,
  });
  const goal = hub.week.goal;
  return {
    now: hub.now,
    timezone: hub.tz,
    date: hub.todayKey,
    today: tasks.filter((t) => !t.overdue),
    overdue: tasks.filter((t) => t.overdue),
    waitingOn: hub.waitingOn.map((g) => ({
      person: g.person.name,
      tasks: g.tasks.map((t) => ({
        title: t.title,
        waitingDays: t.waitingAt ? Math.floor((Date.now() - new Date(t.waitingAt).getTime()) / 86_400_000) : null,
      })),
    })),
    upNext48h: upcoming.map((e) => ({
      title: e.title,
      date: dayKey(e.date, hub.tz),
      startTime: e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
      person: e.person?.name ?? null,
      location: e.location,
    })),
    week: {
      start: hub.week.weekStart,
      end: hub.week.weekEnd,
      outcomes: hub.week.outcomes,
    },
    scoreboard: {
      today: { ...hub.week.scoreboard.today, cash: dollars(hub.week.scoreboard.today.cashCents) },
      week: { ...hub.week.scoreboard.week, cash: dollars(hub.week.scoreboard.week.cashCents) },
    },
    goal: {
      label: goal.label,
      target: dollars(goal.targetCents),
      collected: dollars(goal.collectedCents),
      percent: goal.targetCents ? Math.round((goal.collectedCents / goal.targetCents) * 1000) / 10 : 0,
      deadline: goal.deadline,
      daysLeft: goal.daysLeft,
    },
    stats: hub.stats,
    inboxUnresolved: await prisma.inboxItem.count({ where: { resolvedAt: null } }),
  };
}
