"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Reveal from "@/components/fx/Reveal";
import { api } from "@/lib/api-client";
import { dayKey } from "@/lib/day";
import type { HubPayload, InboxItem, Outcome, ScoreField, WaitingGroup } from "@/lib/hub-types";
import { formatClock, parseQuickAdd, type ParsedQuickAdd } from "@/lib/quick-add-parse";
import { describeScore } from "@/lib/command-parse";
import type { TownSummary } from "@/lib/town-summary";
import type { Task } from "@/lib/types";
import { useHub } from "@/lib/useHub";
import AgentFeed from "./AgentFeed";
import BriefCard from "./BriefCard";
import { UpNextCard, WaitingCard } from "./HubCards";
import { AgentRoster, Connectors, NumbersStrip, type NumberItem } from "./HubExtras";
import HomeScreen, { FOCUS_COMMAND_EVENT, SECTIONS, type CommandRun } from "./HomeScreen";
import HubCalendar from "./HubCalendar";
import HubPeople from "./HubPeople";
import { useEffect } from "react";
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
    // Completing (sign -1) adds one to done; undo takes it back.
    doneToday: Math.max(0, stats.doneToday - sign),
  };
}

export default function HubDashboard({ name }: { name: string }) {
  const hub = useHub(8000);
  const { data, mutate } = hub;
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const [showExtras, setShowExtras] = useState(false);

  const say = useCallback((text: string, onAction?: () => void, actionLabel?: string) => {
    setToast({ id: Date.now(), text, onAction, actionLabel });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);
  const failed = useCallback(() => say("Couldn't save that. Showing the server copy."), [say]);

  async function manualRefresh() {
    await hub.refresh();
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

  async function postNote(agent: string, text: string) {
    if (!data) return;
    await mutate(null, () =>
      postJson(`/api/inbox${tzQuery(data.tz)}`, { agent, kind: "note", title: text.slice(0, 300), body: text.length > 300 ? text : null })
    );
    say(agent === "abdi" ? "Posted to the agent feed" : `Posted a note for ${agent}`);
  }

  const runCommand: CommandRun = async (cmd, parsed) => {
    if (!data) return;
    switch (cmd.kind) {
      case "task": {
        const p = parsed ?? parseQuickAdd(cmd.text, { categories: data.categories, people: data.people });
        if (!p.title) return;
        await addTask(p);
        if (p.pinToday || !p.dueDate || p.dueLabel === "today") say(`Added to Today: ${p.title}`);
        return;
      }
      case "score": {
        score(cmd.field, cmd.delta);
        const after = (data.week.scoreboard.today[cmd.field] ?? 0) + cmd.delta;
        say(`Logged ${describeScore(cmd.field, cmd.delta)}. Today: ${describeScore(cmd.field, after)}`);
        return;
      }
      case "note":
        if (!cmd.text) return;
        await postNote(cmd.agent, cmd.text);
        return;
      case "nav":
        router.push(cmd.href);
        return;
      case "find":
        router.push(`/tasks?find=${encodeURIComponent(cmd.query)}`);
        return;
      case "empty":
        return;
    }
  };

  const [pastHome, setPastHome] = useState(false);
  useEffect(() => {
    const onScroll = () => setPastHome(window.scrollY > window.innerHeight * 0.6);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // /hub#calendar from the nav: scroll once the sections exist, and again on hash changes.
  const hasData = !!data;
  useEffect(() => {
    const go = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    };
    if (hasData) go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [hasData]);

  function backToBar() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => window.dispatchEvent(new Event(FOCUS_COMMAND_EVENT)), 450);
  }

  const [briefBusy, setBriefBusy] = useState(false);
  async function generateBrief() {
    if (briefBusy) return;
    setBriefBusy(true);
    say("Writing today's brief...");
    try {
      const res = await fetch("/api/morning-brief/generate", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      await hub.refresh();
      say("Brief ready", () => router.push("/brief"), "Read");
    } catch {
      say("Couldn't generate the brief. Check ANTHROPIC_API_KEY.");
    } finally {
      setBriefBusy(false);
    }
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
  const metrics = data?.metrics && "data" in data.metrics ? data.metrics.data : null;

  const numbers: NumberItem[] = [
    { label: "Open", value: data?.stats.open, href: "/tasks" },
    { label: "Overdue", value: data?.stats.overdue, href: "/tasks", danger: true },
    { label: "Due today", value: data?.stats.dueToday, href: "/tasks" },
    { label: "Waiting", value: data?.stats.waiting, href: "/people" },
    ...(agents.length > 0 ? [{ label: "Agents working", value: working, total: agents.length }] : []),
    ...(data?.metrics.configured ? [{ label: "Leads today", value: metrics?.overview.today, href: "/metrics" }] : []),
  ];

  const tz = data?.tz ?? "America/New_York";
  const todayKey = data?.todayKey ?? "";

  const week = data ? <WeekPanel week={data.week} onOutcomes={saveOutcomes} onScore={score} /> : <SkeletonCard rows={5} />;
  const upNext = data ? <UpNextCard events={data.upNext} tz={tz} todayKey={todayKey} /> : <SkeletonCard rows={3} />;
  const waiting = data ? <WaitingCard groups={data.waitingOn} onNudge={nudge} /> : <SkeletonCard rows={2} />;
  const brief = <BriefCard brief={data?.brief ?? null} loaded={!!data} tz={tz} todayKey={todayKey} onGenerated={hub.refresh} />;

  return (
    <div className="relative min-h-full overflow-x-clip">
      <HomeScreen
        name={name}
        data={data}
        updatedAt={hub.updatedAt}
        changedAt={hub.changedAt}
        error={hub.error}
        onRefresh={manualRefresh}
        onRun={runCommand}
        onNavigate={(href) => router.push(href)}
        onGenerateBrief={generateBrief}
      />
      {/* Sticky section nav once you are past the home screen */}
      <div
        className={`sticky top-[57px] z-30 transition-all duration-200 md:top-[61px] ${pastHome ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}
      >
        <div className="mx-auto flex max-w-[1400px] gap-1.5 overflow-x-auto px-4 py-2 no-scrollbar md:px-8">
          {SECTIONS.map((sct) => (
            <button
              key={sct.id}
              onClick={() => (sct.href ? router.push(sct.href) : document.getElementById(sct.id)?.scrollIntoView({ behavior: "smooth", block: "start" }))}
              className="section-pill shrink-0"
            >
              {sct.label}
            </button>
          ))}
        </div>
      </div>
      <div id="dashboard" className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 md:px-8 md:py-7">
        <section className="grid items-start gap-5 lg:grid-cols-12">
          <div className="min-w-0 space-y-4 lg:col-span-7">
            <Reveal delay={STAGGER * 2} className="min-w-0 scroll-mt-28" id="today">
              {data ? <TodayList tasks={data.today} onComplete={completeTask} /> : <SkeletonCard rows={4} />}
            </Reveal>
          </div>
          <div className="min-w-0 space-y-5 lg:sticky lg:top-[77px] lg:col-span-5">
            <Reveal delay={STAGGER * 3} className="min-w-0 scroll-mt-28" id="week">
              {week}
            </Reveal>
            <Reveal delay={STAGGER * 4} className="min-w-0 scroll-mt-20" id="upnext">
              {upNext}
            </Reveal>
            <Reveal delay={STAGGER * 5} className="min-w-0 scroll-mt-20" id="waiting">
              {waiting}
            </Reveal>
            <Reveal delay={STAGGER * 6} className="min-w-0">
              {brief}
            </Reveal>
          </div>
        </section>

        <section className="grid items-start gap-5 lg:grid-cols-12">
          <Reveal delay={STAGGER} className="min-w-0 scroll-mt-28 lg:col-span-7" id="calendar">
            {data ? <HubCalendar categories={data.categories} people={data.people} version={data.version} /> : <SkeletonCard rows={6} />}
          </Reveal>
          <Reveal delay={STAGGER * 2} className="min-w-0 scroll-mt-28 lg:col-span-5" id="people">
            {data ? <HubPeople version={data.version} /> : <SkeletonCard rows={3} />}
          </Reveal>
        </section>

        <Reveal delay={STAGGER}>
          <NumbersStrip items={numbers} />
        </Reveal>

        <Reveal delay={STAGGER} className="scroll-mt-28" id="feed">
          <AgentFeed inbox={data?.inbox ?? []} runs={data?.agents.runs ?? []} onResolve={resolveInbox} />
        </Reveal>

        <Reveal delay={STAGGER} className="scroll-mt-28" id="town">
          <TownLazy agents={agents} runs={data?.agents.runs ?? []} summary={townSummary} onWorkSent={hub.refresh} />
        </Reveal>

        <section>
          <button
            onClick={() => setShowExtras((v) => !v)}
            aria-expanded={showExtras}
            className="flex w-full items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-border-2 hover:text-foreground"
          >
            <span>Agents and connectors</span>
            <span className="font-mono text-xs font-normal text-muted-2">{showExtras ? "hide" : `${agents.length} agents · show`}</span>
          </button>
          {showExtras && (
            <div className="mt-4 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
              <AgentRoster agents={agents} onChanged={hub.refresh} />
              <Connectors />
            </div>
          )}
        </section>
      </div>
      <button
        onClick={backToBar}
        aria-label="Add something"
        title="Back to the command bar"
        className={`btn-primary fixed bottom-6 right-6 z-40 hidden h-12 w-12 rounded-full p-0 text-2xl shadow-[0_12px_30px_-10px_rgba(230,180,80,0.6)] transition-all duration-200 md:inline-flex ${
          pastHome ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        +
      </button>
      <ToastHost toast={toast} onDone={clearToast} />
    </div>
  );
}

function SkeletonCard({ rows }: { rows: number }) {
  return (
    <div className="card p-5">
      <div className="mb-4 h-3 w-24 animate-pulse rounded-full bg-surface-hover" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded-full bg-surface-hover" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}
