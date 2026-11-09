"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { HubPayload } from "@/lib/hub-types";
import { commandHint, parseCommand, type Command } from "@/lib/command-parse";
import { parseQuickAdd, type ParsedQuickAdd } from "@/lib/quick-add-parse";
import { dayKey } from "@/lib/day";
import { ago, useMedia, useNow, CheckMark } from "./hub-ui";
import { nextAction, type NextAction } from "@/lib/next-action";
import { track } from "@/lib/signals-client";
import type { ScoreField, WaitingGroup } from "@/lib/hub-types";
import type { Task } from "@/lib/types";
import { Counter, CashCounter } from "./WeekPanel";
import { TodayRow } from "./TodayList";
import { shortMoney as money } from "@/lib/command-parse";

/* ── Backdrop ─────────────────────────────────────────────────── */

export type BackdropId = "madinah" | "dc" | "none";
export const BACKDROPS: { id: BackdropId; label: string; src: string | null }[] = [
  { id: "madinah", label: "Madinah night", src: "/backgrounds/madinah-night.jpg" },
  { id: "dc", label: "DC dusk", src: "/backgrounds/dc-dusk.jpg" },
  { id: "none", label: "None", src: null },
];
const BACKDROP_KEY = "pos.backdrop";

function readBackdrop(): BackdropId {
  try {
    const v = localStorage.getItem(BACKDROP_KEY);
    if (v === "madinah" || v === "dc" || v === "none") return v;
  } catch {
    // private mode etc.
  }
  return "madinah";
}

const BACKDROP_EVENT = "pos:backdrop";
function subscribeBackdrop(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(BACKDROP_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(BACKDROP_EVENT, cb);
  };
}

export function useBackdrop() {
  const id = useSyncExternalStore(subscribeBackdrop, readBackdrop, () => "madinah" as BackdropId);
  function choose(next: BackdropId) {
    try {
      localStorage.setItem(BACKDROP_KEY, next);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(BACKDROP_EVENT));
  }
  return { id, choose, backdrop: BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0] };
}

function Backdrop({ src, kenBurns }: { src: string | null; kenBurns: boolean }) {
  return (
    <div className="home-bg" aria-hidden>
      <AnimatePresence initial={false}>
        {src && (
          <motion.div
            key={src}
            className={`absolute inset-0 ${kenBurns ? "ken-burns" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Image src={src} alt="" fill priority sizes="100vw" quality={80} style={{ objectFit: "cover", objectPosition: "center 40%" }} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="home-bg-overlay" />
    </div>
  );
}

/* ── Greeting ─────────────────────────────────────────────────── */

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

/** The one line under the greeting: the most important thing right now. */
function headline(d: HubPayload | null, now: number | null): string {
  if (!d || !now) return " ";
  const late = d.today.filter((t) => t.overdue).length;
  if (late > 0) return late === 1 ? "1 task is late. Start there." : `${late} tasks are late. Start there.`;
  const next = d.upNext.find((e) => dayKey(new Date(e.date), d.tz) === d.todayKey && e.startTime);
  if (next?.startTime) {
    const [h, m] = next.startTime.split(":").map(Number);
    const at = new Date(now);
    at.setHours(h, m, 0, 0);
    const mins = (at.getTime() - now) / 60000;
    if (mins >= 0 && mins <= 120) return `${next.title} at ${fmtClock(next.startTime)}.`;
  }
  const open = d.today.length;
  if (open > 0) return `${open} thing${open === 1 ? "" : "s"} for today, ${d.stats.doneToday} done.`;
  return "Clear day. Pick one outcome.";
}

function fmtClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

/* ── Command bar ──────────────────────────────────────────────── */

const PLACEHOLDERS = [
  "Add a task: call Joaquin 2pm",
  "Log: 5 dials",
  "Cash 500",
  "Note for jarvis: ...",
  "Find a task or a person",
];

export const FOCUS_COMMAND_EVENT = "pos:focus-command";

export type CommandRun = (cmd: Command, parsed: ParsedQuickAdd | null) => Promise<void> | void;

function CommandBar({ data, onRun }: { data: HubPayload | null; onRun: CommandRun }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [ph, setPh] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDesktop = useMedia("(min-width: 768px)");

  useEffect(() => {
    const id = setInterval(() => setPh((p) => (p + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isDesktop) inputRef.current?.focus();
  }, [isDesktop]);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    // The mobile "+" on other pages lands here with ?add=1.
    if (window.location.search.includes("add=1")) {
      focus();
      window.history.replaceState(null, "", "/hub");
    }
    window.addEventListener(FOCUS_COMMAND_EVENT, focus);
    return () => window.removeEventListener(FOCUS_COMMAND_EVENT, focus);
  }, []);

  const cmd = useMemo(() => parseCommand(value), [value]);
  const parsed = useMemo(
    () => (cmd.kind === "task" && data ? parseQuickAdd(cmd.text, { categories: data.categories, people: data.people }) : null),
    [cmd, data]
  );
  const hint = commandHint(cmd, parsed);

  async function submit() {
    if (cmd.kind === "empty" || busy) return;
    setBusy(true);
    try {
      await onRun(cmd, parsed);
      setValue("");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="w-full">
      <div className="command-bar flex h-[60px] items-center gap-3 rounded-[20px] px-3 pr-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent font-mono text-sm font-bold text-accent-ink">
          ⌘
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={busy}
          aria-label="Command"
          placeholder={PLACEHOLDERS[ph]}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-2"
        />
        <span className="hidden font-mono text-[11px] text-muted-2 sm:inline">ENTER</span>
      </div>
      <p className="mt-2 min-h-5 px-1 text-center font-mono text-[11px] text-muted-2 transition-opacity">{hint}</p>
    </div>
  );
}







function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── Do this now ──────────────────────────────────────────────── */

const ACTION_LABEL: Record<NextAction["kind"], string> = {
  late: "Late",
  event: "Up next",
  question: "Question",
  nudge: "Owed to you",
  dial: "Behind pace",
  task: "Do this now",
  stale: "Stale",
  outcome: "This week",
};

let lastShown: { key: string; at: number } = { key: "", at: 0 };

/** Stable id for a card: the thing it points at, not its wording. */
function actionKey(a: NextAction) {
  switch (a.kind) {
    case "late":
    case "task":
    case "stale":
      return `${a.kind}:${a.task.id}`;
    case "event":
      return `event:${a.eventId}`;
    case "question":
      return `question:${a.inboxId}`;
    case "nudge":
      return `nudge:${a.personId}`;
    case "dial":
      return "dial";
    default:
      return "outcome";
  }
}

function DoNow({
  action,
  onDone,
  onNext,
  onDrop,
  onDial,
  onNudge,
  onAnswer,
  onOpen,
}: {
  action: NextAction;
  onDone: (task: Task) => void;
  onNext: (task: Task) => void;
  onDrop: (task: Task) => void;
  onDial: () => void;
  onNudge: () => void;
  onAnswer: () => void;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const actionRef = actionKey(action);
  useEffect(() => {
    // Once per card per sitting: StrictMode, remounts and the poll all re-run this effect.
    if (lastShown.key === actionRef && Date.now() - lastShown.at < 10 * 60_000) return;
    lastShown = { key: actionRef, at: Date.now() };
    track("donow.shown", actionRef, { kind: action.kind, title: action.title.slice(0, 120) });
  }, [actionRef, action.kind, action.title]);
  const acted = (label: string, run: () => void) => () => {
    track("donow.acted", actionRef, { kind: action.kind, label });
    run();
  };
  const primary =
    action.kind === "late" || action.kind === "task"
      ? { label: "Done", run: () => onDone(action.task) }
      : action.kind === "stale"
        ? { label: "Drop", run: () => onDrop(action.task) }
      : action.kind === "dial"
        ? { label: "+5 dials", run: onDial }
        : action.kind === "nudge"
          ? { label: "Nudge", run: onNudge }
          : action.kind === "question"
            ? { label: "Answered", run: onAnswer }
            : { label: "Open", run: onOpen };
  const danger = action.kind === "late";
  primary.run = acted(primary.label, primary.run);
  const secondary =
    action.kind === "stale"
      ? { label: "Done instead", run: acted("Done instead", () => onDone(action.task)) }
      : action.kind === "late" || action.kind === "task"
        ? { label: "Not now", run: acted("Not now", () => onNext(action.task)) }
        : null;
  return (
    <motion.div
      key={action.kind + action.title}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`do-now relative overflow-hidden rounded-3xl p-5 md:p-6 ${danger ? "do-now-danger" : ""}`}
    >
      <span className={`eyebrow ${danger ? "text-danger" : "eyebrow-accent"}`}>{ACTION_LABEL[action.kind]}</span>
      <h2 className="mt-2 text-[clamp(1.25rem,3.4vw,1.75rem)] font-extrabold leading-tight tracking-[-0.03em] text-foreground">{action.title}</h2>
      <p className="mt-1 text-[14px] text-muted">{action.detail}</p>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={primary.run} className="btn-primary h-11 px-5 text-sm">
          {primary.label}
        </button>
        {secondary && (
          <button onClick={secondary.run} className="btn-ghost h-11 px-4 text-sm text-muted">
            {secondary.label}
          </button>
        )}
        {primary.label !== "Open" && (
          <button onClick={onOpen} className="btn-ghost h-11 px-4 text-sm text-muted">
            Open
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** The jump buttons at the top of the home screen. Everything lives on the Hub; Tasks is the one deep page. */
export const SECTIONS: { id: string; label: string; href?: string }[] = [
  { id: "today", label: "Today" },
  { id: "calendar", label: "Calendar" },
  { id: "people", label: "People" },
  { id: "week", label: "This week" },
  { id: "feed", label: "Agents" },
  { id: "town", label: "Town", href: "/town" },
  { id: "tasks", label: "All tasks", href: "/tasks" },
];

/* ── Home screen ──────────────────────────────────────────────── */

export default function HomeScreen({
  name,
  data,
  updatedAt,
  changedAt,
  error,
  onRefresh,
  onRun,
  onNavigate,
  onComplete,
  onNext,
  onDrop,
  onScore,
  onNudge,
  onResolveInbox,
  brief,
}: {
  name: string;
  /** The morning brief card, shown in the Jarvis drop-down at the top. */
  brief: React.ReactNode;
  data: HubPayload | null;
  updatedAt: number | null;
  changedAt: number;
  error: boolean;
  onRefresh: () => void;
  onRun: CommandRun;
  onNavigate: (href: string) => void;
  onComplete: (task: Task) => void;
  onNext: (task: Task) => void;
  onDrop: (task: Task) => void;
  onScore: (field: ScoreField, delta: number) => void;
  onNudge: (group: WaitingGroup) => void;
  onResolveInbox: (id: string) => void;
}) {
  const now = useNow(1000);
  const reduced = useReducedMotion();
  const isDesktop = useMedia("(min-width: 768px)");
  const { id: backdropId, choose, backdrop } = useBackdrop();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [jarvisOpen, setJarvisOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const d = now ? new Date(now) : null;
  const live = !error && updatedAt !== null;

  const action = useMemo(() => (data && now ? nextAction(data, new Date(now)) : null), [data, now]);
  const topThree = useMemo(() => (data ? data.today.slice(0, 3) : []), [data]);

  const rise = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.6, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section className="home relative flex min-h-[100svh] flex-col md:min-h-[88vh]">
      <Backdrop src={backdrop.src} kenBurns={isDesktop && !reduced} />

      <div className="relative z-10 mx-auto flex w-full max-w-[880px] flex-1 flex-col items-center justify-center px-4 pb-16 pt-8 md:pb-20">
        {/* 0. Jarvis: the morning brief, one tap, drops down */}
        <motion.div {...rise(0)} className="flex w-full max-w-[720px] flex-col items-center">
          <button
            onClick={() => setJarvisOpen((v) => !v)}
            aria-expanded={jarvisOpen}
            aria-controls="jarvis-brief"
            className={`jarvis ${jarvisOpen ? "jarvis-open" : ""}`}
          >
            <span className="jarvis-orb" aria-hidden>
              <span className="hub-wave flex h-3 items-end gap-[2px]">
                {[0.1, 0.35, 0.2, 0.5, 0.15].map((dl, i) => (
                  <span key={i} style={{ height: "100%", animationDelay: `${dl}s` }} />
                ))}
              </span>
            </span>
            <span className="text-[13px] font-semibold tracking-wide">Jarvis</span>
            <span className="font-mono text-[11px] text-muted-2">{jarvisOpen ? "close" : "morning brief"}</span>
          </button>
          <AnimatePresence initial={false}>
            {jarvisOpen && (
              <motion.div
                id="jarvis-brief"
                key="jarvis"
                initial={reduced ? false : { opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={reduced ? undefined : { opacity: 0, height: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="w-full overflow-hidden"
              >
                <div className="pt-3">{brief}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.nav {...rise(1)} aria-label="Jump to" className="mt-8 flex max-w-full flex-wrap items-center justify-center gap-1.5">
          {SECTIONS.map((sct) => (
            <button
              key={sct.id}
              onClick={() => (sct.href ? onNavigate(sct.href) : scrollTo(sct.id))}
              className="section-pill"
            >
              {sct.label}
            </button>
          ))}
        </motion.nav>

        <motion.p {...rise(2)} className="eyebrow eyebrow-accent mt-8 flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5" title={error ? "Can't reach the server" : "Live"}>
            <span key={changedAt} className={`absolute inset-0 rounded-full ${changedAt ? "live-ring" : ""}`} />
            <span className={`relative h-1.5 w-1.5 rounded-full ${live ? "blink-dot" : ""}`} style={{ background: live ? "var(--accent)" : "var(--danger)" }} />
          </span>
          <span>{d ? d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }).toUpperCase() : " "}</span>
        </motion.p>

        <motion.h1 {...rise(3)} className="mt-3 text-center text-[clamp(2.4rem,6vw,4.5rem)]">
          {d ? greeting(d.getHours()) : "Hey"}, <span className="hl">{name}</span>.
        </motion.h1>

        <motion.p {...rise(4)} className="mt-3 min-h-6 text-center text-[15px] text-muted md:text-[17px]">
          {headline(data, now)}
        </motion.p>

        {/* 1. Do this now */}
        <motion.div {...rise(5)} className="mt-10 w-full max-w-[720px]">
          {action && data ? (
            <DoNow
              action={action}
              onDone={(t) => onComplete(t)}
              onNext={(t) => onNext(t)}
              onDrop={(t) => onDrop(t)}
              onDial={() => onScore("dials", 5)}
              onNudge={() => {
                const g = action.kind === "nudge" ? data.waitingOn.find((w) => w.person.id === action.personId) : null;
                if (g) onNudge(g);
              }}
              onAnswer={() => (action.kind === "question" ? onResolveInbox(action.inboxId) : undefined)}
              onOpen={() => {
                if (action.kind === "event") scrollTo("calendar");
                else if (action.kind === "outcome") scrollTo("week");
                else if (action.kind === "task" || action.kind === "late" || action.kind === "stale") onNavigate(`/tasks?highlight=${action.task.id}`);
                else if (action.kind === "nudge") onNavigate(`/people/${action.personId}`);
                else if (action.kind === "question") scrollTo("feed");
              }}
            />
          ) : (
            <div className="do-now h-[132px] animate-pulse rounded-3xl" />
          )}
        </motion.div>

        {/* 2. Scoreboard, its own block */}
        <motion.div {...rise(6)} id="scoreboard" className="mt-10 w-full max-w-[720px] scroll-mt-28">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="eyebrow eyebrow-accent">Scoreboard</span>
            {data && (
              <span className="font-mono text-[11px] text-muted-2">
                {money(data.week.goal.collectedCents)} of {money(data.week.goal.targetCents)} · {data.week.goal.daysLeft} days left
              </span>
            )}
          </div>
          {data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
              <Counter label="Dials" value={data.week.scoreboard.today.dials} onAdd={(n) => onScore("dials", n)} extra={5} />
              <Counter label="Convos" value={data.week.scoreboard.today.convos} onAdd={(n) => onScore("convos", n)} />
              <Counter label="Booked" value={data.week.scoreboard.today.booked} onAdd={(n) => onScore("booked", n)} />
              <CashCounter cents={data.week.scoreboard.today.cashCents} onAdd={(c) => onScore("cashCents", c)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="tile h-[118px] animate-pulse" />
              ))}
            </div>
          )}
        </motion.div>

        {/* 3. Today's three */}
        <motion.div {...rise(7)} className="mt-10 w-full max-w-[720px]">
          {data && (
            <div className="card p-3">
              <div className="flex items-center justify-between px-2 pt-1 pb-2">
                <span className="eyebrow eyebrow-accent">Today</span>
                <button onClick={() => scrollTo("today")} className="font-mono text-[11px] text-muted hover:text-accent">
                  {data.today.length > 3 ? `all ${data.today.length}` : "open list"}
                </button>
              </div>
              {topThree.length === 0 ? (
                <p className="flex items-center gap-2 px-2 pb-2 text-sm text-muted">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink">
                    <CheckMark on size={11} />
                  </span>
                  Clear for today.
                </p>
              ) : (
                <ul className="space-y-1">
                  <AnimatePresence initial={false}>
                    {topThree.map((t) => (
                      <TodayRow key={t.id} task={t} onComplete={onComplete} onNext={onNext} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          )}
        </motion.div>

        {/* 4. Command bar, for the rare thing it doesn't already know */}
        <motion.div {...rise(8)} className="mt-8 w-full max-w-[720px]">
          <CommandBar data={data} onRun={onRun} />
        </motion.div>
      </div>

      {/* bottom row: backdrop picker + refresh + scroll hint */}
      <div className="relative z-10 mx-auto flex w-full max-w-[880px] items-center justify-between px-4 pb-4">
        <div className="relative">
          <button onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen} className="btn-ghost h-9 px-3 text-xs text-muted">
            Backdrop
          </button>
          {pickerOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-44 rounded-2xl border border-border-2 bg-surface-hover p-1.5 shadow-xl animate-fade-in">
              {BACKDROPS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    choose(b.id);
                    setPickerOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${b.id === backdropId ? "text-accent" : "text-foreground hover:bg-surface-2"}`}
                >
                  {b.label}
                  {b.id === backdropId && <span className="text-xs">●</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <motion.div
          aria-hidden
          className="text-muted-2"
          animate={scrolled || reduced ? { opacity: 0 } : { opacity: [0.5, 1, 0.5], y: [0, 4, 0] }}
          transition={scrolled ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity, repeatDelay: 4.4 }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>

        <span className="flex items-center gap-2 font-mono text-[11px] text-muted-2">
          <span className="hidden sm:inline">{updatedAt && now ? `updated ${ago(updatedAt, now)}` : error ? "offline" : "syncing"}</span>
          <button onClick={onRefresh} aria-label="Refresh" title="Refresh" className="btn-ghost h-9 w-9 text-muted">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
      </div>
    </section>
  );
}
