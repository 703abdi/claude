"use client";

import { useCallback, useMemo, useState } from "react";
import Reveal from "@/components/fx/Reveal";
import { api } from "@/lib/api-client";
import { dayKey } from "@/lib/day";
import type { HubPayload, InboxItem, Outcome, ScoreField, WaitingGroup } from "@/lib/hub-types";
import { formatClock, type ParsedQuickAdd } from "@/lib/quick-add-parse";
import type { TownSummary } from "@/lib/town-summary";
import type { Task } from "@/lib/types";
import { useHub } from "@/lib/useHub";
import AgentFeed from "./AgentFeed";
import BriefCard from "./BriefCard";
import { UpNextCard, WaitingCard } from "./HubCards";
import { AgentRoster, Connectors, StatTile } from "./HubExtras";
import HubHeader from "./HubHeader";
import HubQuickAdd from "./HubQuickAdd";
import { ToastHost, type Toast } from "./hub-ui";
import TodayList from "./TodayList";
import TownLazy from "./TownLazy";
import WeekPanel from "./WeekPanel";

const STAGGER = 0.06;

async function postJson(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function tzQuery(tz: string) {
  return `?tz=${encodeURIComponent(tz)}`;
}

/** Where the server will put a task in Today: overdue, then pinned by position, then due today. */
function insertToday(list: Task[], task: Task) {
  const rank = (t: Task) => (t.overdue ? 0 : t.pinnedToday ? 1 : 2);
  const r = rank(task);
  const idx = list.findIndex((t) => rank(t) > r);
  return idx === -1 ? [...list, task] : [...list.slice(0, idx), task, ...list.slice(idx)];
}

function adjustStats(stats: HubPayload["stats"], task: Task, sign: 1 | -1, d: HubPayload) {
  const dueToday = !!task.dueDate && dayKey(new Date(task.dueDate), d.tz) === d.todayKey;
  return {
    ...stats,
    open: stats.open + sign,
    overdue: stats.overdue + (task.overdue ? sign : 0),
    dueToday: stats.dueToday + (dueToday ? sign : 0),
  };
}

export default function HubDashboard({ name }: { name: string }) {
  const hub = useHub(8000);
  const { data, mutate } = hub;
  const [toast, setToast] = useState<Toast | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [showExtras, setShowExtras] = useState(false);

  const say = useCallback((text: string, onAction?: () => void, actionLabel?: string) => {
    setToast({ id: Date.now(), text, onAction, actionLabel });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);
  const failed = useCallback(() => say("Couldn't save that. Showing the server copy."), [say]);

  async function manualRefresh() {
    setSpinning(true);
    await hub.refresh();
    setTimeout(() => setSpinning(false), 300);
  }

  // ── mutations (all optimistic) ────────────────────────────────
  function completeTask(task: Task) {
    if (!data) return;
    const index = data.today.findIndex((t) => t.id === task.id);
    mutate(
      (d) => ({ ...d, today: d.today.filter((t) => t.id !== task.id), stats: adjustStats(d.stats, task, -1, d) }),
      () => api.tasks.update(task.id, { status: "COMPLETED" })
    ).catch(failed);
    say(`Done: ${task.title}`, () => undoComplete(task, index), "Undo");
  }

  function undoComplete(task: Task, index: number) {
    mutate(
      (d) => {
        const today = d.today.filter((t) => t.id !== task.id);
        today.splice(Math.max(0, Math.min(index, today.length)), 0, task);
        return { ...d, today, stats: adjustStats(d.stats, task, 1, d) };
      },
      () => api.tasks.update(task.id, { status: task.status })
    ).catch(failed);
  }

  async function addTask(p: ParsedQuickAdd) {
    if (!data) return;
    const pinned = p.pinToday || !p.dueDate;
    const dueToday = !!p.dueDate && dayKey(new Date(p.dueDate), data.tz) === data.todayKey;
    const inToday = pinned || dueToday;
    const now = new Date().toISOString();
    const temp: Task = {
      id: `tmp-${Date.now()}`,
      title: p.title,
      description: null,
      status: "NOT_STARTED",
      effort: p.effort ?? "LOW",
      position: Number.MAX_SAFE_INTEGER,
      aiPriorityScore: null,
      aiPriorityReason: null,
      pinnedToday: pinned,
      category: p.category,
      dueDate: p.dueDate,
      dueTime: p.dueTime,
      location: null,
      notes: null,
      followUpRequired: false,
      followUpDate: null,
      followUpPerson: null,
      parentTaskId: null,
      createdAt: now,
      startedAt: null,
      waitingAt: null,
      completedAt: null,
      updatedAt: now,
      isSeed: false,
      source: null,
      steps: [],
      people: p.people.map((x) => ({ ...x, notes: null })),
      blockedBy: [],
      blocks: [],
      bucket: pinned ? "TODAY" : "NOW",
      dateBucket: "NOW",
      overdue: false,
      isBlocked: false,
    };
    await mutate(
      inToday
        ? (d) => ({
            ...d,
            today: insertToday(d.today, temp),
            stats: { ...d.stats, open: d.stats.open + 1, dueToday: d.stats.dueToday + (dueToday ? 1 : 0) },
          })
        : (d) => ({ ...d, stats: { ...d.stats, open: d.stats.open + 1 } }),
      () =>
        api.tasks.create({
          title: p.title,
          categoryId: p.category?.id ?? null,
          dueDate: p.dueDate,
          dueTime: p.dueTime,
          effort: p.effort ?? undefined,
          personIds: p.people.map((x) => x.id),
          pinnedToday: pinned,
        }),
      (d, created) => ({ ...d, today: d.today.map((t) => (t.id === temp.id ? created : t)) })
    );
    if (!inToday) say(`Saved for ${p.dueLabel}${p.dueTime ? ` ${formatClock(p.dueTime)}` : ""}: ${p.title}`);
  }

  function nudge(g: WaitingGroup) {
    const at = new Date().toISOString();
    mutate(
      (d) => ({
        ...d,
        waitingOn: d.waitingOn.map((w) =>
          w.person.id === g.person.id ? { ...w, tasks: w.tasks.map((t) => ({ ...t, followUpDate: at })) } : w
        ),
      }),
      () => Promise.all(g.tasks.map((t) => api.tasks.update(t.id, { followUpDate: at })))
    ).catch(failed);
  }

  function score(field: ScoreField, delta: number) {
    if (!data) return;
    const bump = (s: HubPayload["week"]["scoreboard"]["today"]) => ({ ...s, [field]: Math.max(0, s[field] + delta) });
    mutate(
      (d) => ({
        ...d,
        week: {
          ...d.week,
          scoreboard: { today: bump(d.week.scoreboard.today), week: bump(d.week.scoreboard.week) },
          goal:
            field === "cashCents" ? { ...d.week.goal, collectedCents: Math.max(0, d.week.goal.collectedCents + delta) } : d.week.goal,
        },
      }),
      () => postJson(`/api/score${tzQuery(data.tz)}`, { field, delta, date: data.todayKey })
    ).catch(failed);
  }

  function saveOutcomes(outcomes: Outcome[]) {
    if (!data) return;
    mutate(
      (d) => ({ ...d, week: { ...d.week, outcomes } }),
      () => postJson(`/api/week${tzQuery(data.tz)}`, { weekStart: data.week.weekStart, outcomes }, "PATCH")
    ).catch(failed);
  }

  function resolveInbox(item: InboxItem, action: "task" | "dismiss") {
    if (!data) return;
    mutate(
      (d) => ({ ...d, inbox: d.inbox.filter((i) => i.id !== item.id) }),
      () => postJson(`/api/inbox/${item.id}/resolve${tzQuery(data.tz)}`, { action })
    )
      .then(() => action === "task" && !item.taskId && say(`Added to Today: ${item.title}`))
      .catch(failed);
  }

  // ── derived ──────────────────────────────────────────────────
  const townSummary: TownSummary | null = useMemo(
    () =>
      data
        ? {
            tasks: {
              open: data.stats.open,
              overdue: data.stats.overdue,
              dueToday: data.stats.dueToday,
              items: data.today.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
            },
            calendar: { items: data.upNext.map((e) => ({ id: e.id, title: e.title, date: e.date, startTime: e.startTime })) },
            people: { count: data.people.length, names: data.people },
            metrics: data.metrics,
          }
        : null,
    [data]
  );

  const agents = data?.agents.agents ?? [];
  const working = agents.filter((a) => a.status === "WORKING").length;
  const queued = agents.reduce((n, a) => n + a.queued, 0);
  const metrics = data?.metrics && "data" in data.metrics ? data.metrics.data : null;

  const tiles = [
    { label: "Open", value: data?.stats.open, accent: "#9b7bff", href: "/tasks" },
    { label: "Overdue", value: data?.stats.overdue, accent: "#ff4d5e", href: "/tasks", hot: (data?.stats.overdue ?? 0) > 0 },
    { label: "Due today", value: data?.stats.dueToday, accent: "#ffb347", href: "/tasks" },
    { label: "Waiting", value: data?.stats.waiting, accent: "#f5a623", href: "/people" },
    { label: "Agents working", value: data ? working : undefined, total: agents.length, accent: "#22e1ff", sub: queued ? `${queued} queued` : "queue clear" },
    {
      label: "Leads today",
      value: metrics ? metrics.overview.today : undefined,
      accent: "#60a5fa",
      href: "/metrics",
      sub: metrics ? `${metrics.overview.last7} this week` : "abdiform not connected",
      spark: metrics?.timeline.slice(-14).map((d) => d.count),
    },
    ...(metrics
      ? [
          {
            label: "Form completion",
            value: metrics.overview.completion != null ? Math.round(metrics.overview.completion * 100) : undefined,
            suffix: "%",
            accent: "#ff4fd8",
            href: "/metrics",
            sub: `${Math.round(metrics.overview.winRate * 100)}% win rate`,
          },
        ]
      : []),
  ];

  const tz = data?.tz ?? "America/New_York";
  const todayKey = data?.todayKey ?? "";

  return (
    <div className="hub-bg relative min-h-full overflow-x-clip">
      <div className="hud-grid" />
      <div className="relative z-10 mx-auto max-w-[1400px] space-y-4 px-4 py-4 md:space-y-5 md:px-8 md:py-6">
        <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] md:gap-5">
          <div className="min-w-0 space-y-3">
            <Reveal className="min-w-0">
              <HubHeader
                name={name}
                updatedAt={hub.updatedAt}
                changedAt={hub.changedAt}
                loading={spinning}
                error={hub.error}
                onRefresh={manualRefresh}
              />
            </Reveal>
            <Reveal delay={STAGGER} className="sticky top-[58px] z-30 min-w-0 md:top-[62px]">
              <HubQuickAdd categories={data?.categories ?? []} people={data?.people ?? []} onSubmit={addTask} />
            </Reveal>
            <Reveal delay={STAGGER * 2} className="min-w-0">
              {data ? <TodayList tasks={data.today} onComplete={completeTask} /> : <SkeletonCard rows={4} />}
            </Reveal>
          </div>
          <Reveal delay={STAGGER * 3} className="min-w-0 lg:sticky lg:top-[70px]">
            <BriefCard brief={data?.brief ?? null} loaded={!!data} tz={tz} todayKey={todayKey} onGenerated={hub.refresh} />
          </Reveal>
        </section>

        <section className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-5">
          <Reveal delay={STAGGER * 4} className="min-w-0">
            {data ? <UpNextCard events={data.upNext} tz={tz} todayKey={todayKey} /> : <SkeletonCard rows={3} />}
          </Reveal>
          <Reveal delay={STAGGER * 5} className="min-w-0">
            {data ? <WaitingCard groups={data.waitingOn} onNudge={nudge} /> : <SkeletonCard rows={2} />}
          </Reveal>
          <Reveal delay={STAGGER * 6} className="min-w-0 md:col-span-2 xl:col-span-1">
            {data ? <WeekPanel week={data.week} onOutcomes={saveOutcomes} onScore={score} /> : <SkeletonCard rows={5} />}
          </Reveal>
        </section>

        <section className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${tiles.length > 6 ? "xl:grid-cols-7" : "xl:grid-cols-6"}`}>
          {tiles.map((tile, i) => (
            <Reveal key={tile.label} delay={STAGGER * (7 + i)} className="min-w-0">
              <StatTile {...tile} />
            </Reveal>
          ))}
        </section>

        <Reveal delay={STAGGER}>
          <AgentFeed inbox={data?.inbox ?? []} runs={data?.agents.runs ?? []} onResolve={resolveInbox} />
        </Reveal>

        <Reveal delay={STAGGER}>
          <TownLazy agents={agents} runs={data?.agents.runs ?? []} summary={townSummary} onWorkSent={hub.refresh} />
        </Reveal>

        <section>
          <button
            onClick={() => setShowExtras((v) => !v)}
            aria-expanded={showExtras}
            className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-muted hover:text-foreground"
          >
            <span>Agents and connectors</span>
            <span className="font-mono text-xs">{showExtras ? "hide" : `${agents.length} agents · show`}</span>
          </button>
          {showExtras && (
            <div className="mt-4 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
              <AgentRoster agents={agents} onChanged={hub.refresh} />
              <Connectors />
            </div>
          )}
        </section>
      </div>
      <ToastHost toast={toast} onDone={clearToast} />
    </div>
  );
}

function SkeletonCard({ rows }: { rows: number }) {
  return (
    <div className="rounded-3xl glass p-5">
      <div className="mb-4 h-3 w-24 animate-pulse rounded bg-white/10" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-white/[0.06]" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}
