import { pushLater } from "@/lib/push";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractJson } from "@/lib/ai";
import { getPolicy, sanitizeChanges, savePolicy, POLICY_BOUNDS, type Policy, type Ranked } from "@/lib/policy";
import { signalDigest, logSignal } from "@/lib/signals";
import { dayKey, utcDateFromKey } from "@/lib/day";
import { resolveTz, normalizeOutcomes } from "@/lib/hub-data";


/** The nightly pass. Reads the signal log, the scoreboard, open tasks, people and the live
 * policy; writes the next day's order for Today (with a one-line why each), turns the knobs
 * within bounds, and explains itself in the feed as "brain". Nothing is deleted, nothing is
 * marked done. Runs from the evening cron and from Settings. Needs ANTHROPIC_API_KEY. */

const SOURCE = { type: "MANUAL" as const, name: "brain" };
const THROTTLE_MS = 6 * 60 * 60_000;
const MAX_RANKED = 5;

type BrainOut = {
  ranking?: { taskId?: string; why?: string }[];
  policy?: Record<string, unknown>;
  summary?: string;
  observations?: string[];
};

function compactTask(t: { id: string; title: string; source: string | null; pinnedToday: boolean; dueDate: Date | null; status: TaskStatus; createdAt: Date; followUpPerson: { name: string } | null; people: { person: { name: string } }[] }, now: number) {
  return {
    id: t.id,
    title: t.title.slice(0, 120),
    source: t.source,
    pinned: t.pinnedToday,
    status: t.status,
    due: t.dueDate?.toISOString().slice(0, 10) ?? null,
    ageDays: Math.floor((now - t.createdAt.getTime()) / 86_400_000),
    people: [...t.people.map((p) => p.person.name), ...(t.followUpPerson ? [t.followUpPerson.name] : [])],
  };
}

export async function brainStatus() {
  const [row, last] = await Promise.all([
    prisma.syncSource.findUnique({ where: { type_name: SOURCE } }),
    prisma.inboxItem.findFirst({ where: { agent: "brain" }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    lastRunAt: row?.lastSyncAt?.toISOString() ?? null,
    lastStatus: row?.lastSyncStatus ?? null,
    lastError: row?.lastSyncError ?? null,
    lastPost: last ? { title: last.title, body: last.body, at: last.createdAt.toISOString() } : null,
  };
}

export async function runBrain(opts: { force?: boolean } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: "not configured" as const };
  const row = await prisma.syncSource.upsert({ where: { type_name: SOURCE }, update: {}, create: { ...SOURCE, enabled: true } });
  if (!opts.force && row.lastSyncAt && Date.now() - row.lastSyncAt.getTime() < THROTTLE_MS) return { skipped: "recent" as const };

  const tz = await resolveTz(null);
  const now = new Date();
  const nowMs = now.getTime();
  const todayKey = dayKey(now, tz);
  // After 6pm local the pass plans tomorrow; before that it re-plans today.
  const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now));
  const targetKey = localHour >= 18 ? dayKey(new Date(nowMs + 86_400_000), tz) : todayKey;

  try {
    const { policy, version } = await getPolicy();
    const [signals, scores, open, people, plan, events] = await Promise.all([
      signalDigest(7, 250),
      prisma.scoreEntry.findMany({ where: { date: { gte: utcDateFromKey(dayKey(new Date(nowMs - 14 * 86_400_000), tz)) } }, orderBy: { date: "asc" } }),
      prisma.task.findMany({
        where: { status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS, TaskStatus.WAITING] } },
        include: { people: { include: { person: { select: { name: true } } } }, followUpPerson: { select: { name: true } } },
        orderBy: [{ pinnedToday: "desc" }, { position: "asc" }],
        take: 60,
      }),
      prisma.person.findMany({ select: { name: true, notes: true, _count: { select: { tasks: true, followUpTasks: true } } }, take: 40 }),
      prisma.weekPlan.findFirst({ orderBy: { weekStart: "desc" } }),
      prisma.calendarEvent.findMany({ where: { date: { gte: now, lte: new Date(nowMs + 2 * 86_400_000) } }, select: { title: true, date: true, startTime: true, person: { select: { name: true } } }, orderBy: { date: "asc" } }),
    ]);

    const openIds = new Set(open.map((t) => t.id));
    const actionable = open.filter((t) => t.status !== TaskStatus.WAITING);
    const prompt = `You are the overnight brain of a one-person operating system for Abdi, who runs a sales-driven business. The goal is cash collected, which comes from dials, conversations and booked calls. You decide the order of his Today list for ${targetKey} and you may turn a few knobs. You never invent tasks and never mark anything done.

Return ONLY JSON:
{
  "ranking": [{ "taskId": "<id from the open tasks>", "why": "<one line, under 90 chars, plain words, no hype>" }],   // up to ${MAX_RANKED}, best first, only non-WAITING tasks
  "policy": { "dialTarget"?: number, "dialStartHour"?: number, "fathomPinMax"?: number, "nudgeAfterDays"?: number, "eventLeadMin"?: number, "personAfterSeen"?: number, "dialNudge"?: boolean },  // only keys you want to change, within bounds; omit the object if nothing should change
  "summary": "<two or three plain sentences on what you saw and what you changed and why; no bullet points>",
  "observations": ["<optional short facts worth remembering, max 3>"]
}

Rules for knobs: change at most two per run. Only change a knob when the signals support it (for example: he keeps dropping Fathom items, so lower fathomPinMax; dials are being logged by an agent every day, so dialNudge may turn on). Say the evidence in the summary. Bounds: ${JSON.stringify(POLICY_BOUNDS)}.
Rules for ranking: overdue and promised-to-a-person items first, then what moves this week's outcomes, then the rest. Tasks whose title names a date already past are stale: rank them last or leave them out. Prefer fewer, sharper picks.

Current policy (version ${version}): ${JSON.stringify(policy)}
This week's outcomes: ${JSON.stringify(normalizeOutcomes(plan?.outcomes ?? null))}
Scoreboard, last 14 days (cashCents is cents): ${JSON.stringify(scores.map((s) => ({ day: s.date.toISOString().slice(0, 10), dials: s.dials, convos: s.convos, booked: s.booked, cash: Math.round(s.cashCents / 100) })))}
Calendar next 48h: ${JSON.stringify(events.map((e) => ({ title: e.title, when: `${e.date.toISOString().slice(0, 10)} ${e.startTime ?? ""}`.trim(), with: e.person?.name ?? null })))}
People: ${JSON.stringify(people.map((p) => ({ name: p.name, openTasks: p._count.tasks, owesYou: p._count.followUpTasks })))}
Open tasks (${open.length}): ${JSON.stringify(open.map((t) => compactTask(t, nowMs)))}
Signals, last 7 days. Counts: ${JSON.stringify(signals.counts)}. Recent (newest first): ${JSON.stringify(signals.recent.slice(0, 120))}
Today is ${todayKey} in ${tz}. Local hour ${localHour}.`;

    const out = await extractJson<BrainOut>(prompt, 1800);
    if (!out) throw new Error("The model returned nothing usable.");

    const ranking: Ranked[] = [];
    for (const r of out.ranking ?? []) {
      if (!r?.taskId || !openIds.has(r.taskId) || ranking.some((x) => x.taskId === r.taskId)) continue;
      if (!actionable.some((t) => t.id === r.taskId)) continue;
      ranking.push({ taskId: r.taskId, why: (r.why ?? "").trim().slice(0, 120) });
      if (ranking.length >= MAX_RANKED) break;
    }

    const knobChanges = sanitizeChanges(policy, out.policy ?? {});
    const limited = Object.fromEntries(Object.entries(knobChanges).slice(0, 2)) as Partial<Policy>;
    const summary = (out.summary ?? "").trim().slice(0, 900) || "Ranked tomorrow. No knob changes.";
    const changes: Partial<Policy> = { ...limited, ranking, rankingDay: targetKey };
    const saved = await savePolicy(changes, `Brain pass for ${targetKey}: ${summary}`, "brain");

    const titleFor = (id: string) => open.find((t) => t.id === id)?.title.slice(0, 80) ?? id;
    const lines = [
      ...ranking.map((r, i) => `${i + 1}. ${titleFor(r.taskId)}${r.why ? ` — ${r.why}` : ""}`),
      ...Object.entries(limited).map(([k, v]) => `Knob: ${k} ${String(policy[k as keyof Policy])} -> ${String(v)}`),
    ];
    await prisma.inboxItem.create({
      data: {
        agent: "brain",
        kind: "update",
        title: `Plan for ${targetKey}: ${ranking.length} picked${Object.keys(limited).length ? `, ${Object.keys(limited).length} knob${Object.keys(limited).length === 1 ? "" : "s"} turned` : ""}`,
        body: [summary, lines.join("\n")].filter(Boolean).join("\n\n"),
      },
    });
    pushLater({ title: "Tomorrow is planned", body: `${ranking.length} picked. ${summary.slice(0, 120)}`, url: "/hub#feed", tag: "brain" });
    await prisma.syncSource.update({ where: { type_name: SOURCE }, data: { lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncError: null } });
    await logSignal("brain.run", { source: "brain", ref: String(saved.version), data: { targetKey, ranked: ranking.length, knobs: limited, observations: out.observations ?? [] } });
    return { targetKey, ranked: ranking.length, knobs: limited, version: saved.version, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Brain pass failed";
    await prisma.syncSource.update({ where: { type_name: SOURCE }, data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message } });
    await logSignal("brain.run", { source: "brain", data: { error: message } });
    return { error: message };
  }
}
