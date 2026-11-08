"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { HubPayload } from "@/lib/hub-types";
import { commandHint, parseCommand, shortMoney, type Command } from "@/lib/command-parse";
import { parseQuickAdd, type ParsedQuickAdd } from "@/lib/quick-add-parse";
import { dayKey } from "@/lib/day";
import { ago, useMedia, useNow } from "./hub-ui";

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

/* ── Tiles ────────────────────────────────────────────────────── */

type Tile = { id: string; label: string; big: string; sub?: string; icon: ReactNode; onClick: () => void; ring?: number };

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 tile-icon" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  today: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
  week: "M3 12h4l3-8 4 16 3-8h4",
  next: "M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  waiting: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 11l-3 3-2-2",
  agents: "M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z",
  brief: "M11 5L6 9H2v6h4l5 4V5zM19 12a7 7 0 00-3-5.7M15.5 8.5a3.5 3.5 0 010 7",
};

function TileButton({ tile, index }: { tile: Tile; index: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={tile.onClick}
      className="tile-home group relative flex flex-col items-start justify-between overflow-hidden rounded-3xl p-4 text-left md:p-5"
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.55, delay: 0.28 + index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
    >
      <div className="flex w-full items-center justify-between">
        <span className="eyebrow eyebrow-accent">{tile.label}</span>
        <span className="text-muted-2 transition-colors group-hover:text-accent">{tile.icon}</span>
      </div>
      <div className="mt-3 flex w-full items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 text-[15px] font-bold leading-tight tracking-tight text-foreground md:text-[19px]">{tile.big}</div>
          {tile.sub && <div className="mt-0.5 truncate text-[12px] text-muted">{tile.sub}</div>}
        </div>
        {tile.ring !== undefined && <MiniRing pct={tile.ring} />}
      </div>
    </motion.button>
  );
}

function MiniRing({ pct }: { pct: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} stroke="var(--border-2)" strokeWidth="3" fill="none" />
      <motion.circle
        cx="18"
        cy="18"
        r={r}
        stroke="var(--accent)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, pct))) }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
  onGenerateBrief,
}: {
  name: string;
  data: HubPayload | null;
  updatedAt: number | null;
  changedAt: number;
  error: boolean;
  onRefresh: () => void;
  onRun: CommandRun;
  onNavigate: (href: string) => void;
  onGenerateBrief: () => void;
}) {
  const now = useNow(1000);
  const reduced = useReducedMotion();
  const isDesktop = useMedia("(min-width: 768px)");
  const { id: backdropId, choose, backdrop } = useBackdrop();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const d = now ? new Date(now) : null;
  const live = !error && updatedAt !== null;

  const tiles: Tile[] = useMemo(() => {
    if (!data) return [];
    const late = data.today.filter((t) => t.overdue).length;
    const outcomesDone = data.week.outcomes.filter((o) => o.done).length;
    const goal = data.week.goal;
    const nextEv = data.upNext[0];
    const nextDay = nextEv ? dayKey(new Date(nextEv.date), data.tz) : null;
    const nextWhen = nextEv
      ? `${nextDay === data.todayKey ? "Today" : nextDay === dayKey(new Date((now ?? 0) + 86_400_000), data.tz) ? "Tomorrow" : new Date(nextEv.date).toLocaleDateString(undefined, { weekday: "short" })}${nextEv.startTime ? ` ${fmtClock(nextEv.startTime)}` : ""}`
      : "";
    const oldestWait = data.waitingOn[0]?.tasks[0]?.waitingAt;
    const briefToday = data.brief && dayKey(new Date(data.brief.date), data.tz) === data.todayKey;
    return [
      {
        id: "today",
        label: "Today",
        big: `${data.today.length} open`,
        sub: late ? `${late} late` : `${data.stats.doneToday} done`,
        icon: <Icon d={ICONS.today} />,
        onClick: () => scrollTo("today"),
      },
      {
        id: "week",
        label: "This week",
        big: `${outcomesDone}/${data.week.outcomes.length || 3} outcomes`,
        sub: `${shortMoney(goal.collectedCents)} of ${shortMoney(goal.targetCents)}`,
        ring: goal.targetCents ? goal.collectedCents / goal.targetCents : 0,
        icon: <Icon d={ICONS.week} />,
        onClick: () => scrollTo("week"),
      },
      {
        id: "upnext",
        label: "Up next",
        big: nextEv ? nextEv.title : "Nothing booked",
        sub: nextEv ? nextWhen : "Calendar is clear",
        icon: <Icon d={ICONS.next} />,
        onClick: () => scrollTo("upnext"),
      },
      {
        id: "waiting",
        label: "Waiting on",
        big: data.waitingOn.length ? `${data.waitingOn.length} ${data.waitingOn.length === 1 ? "person" : "people"}` : "Nobody",
        sub: oldestWait && now ? `oldest ${ago(oldestWait, now).replace(" ago", "")}` : "Nobody owes you anything",
        icon: <Icon d={ICONS.waiting} />,
        onClick: () => scrollTo("waiting"),
      },
      {
        id: "feed",
        label: "Agents",
        big: data.inbox.length ? `${data.inbox.length} new` : "Quiet",
        sub: data.inbox[0] ? `from ${data.inbox[0].agent}` : "No agent updates",
        icon: <Icon d={ICONS.agents} />,
        onClick: () => scrollTo("feed"),
      },
      {
        id: "brief",
        label: "Brief",
        big: briefToday ? (data.brief?.hasAudio ? "Listen" : "Read") : "Generate",
        sub: briefToday && data.brief?.audioDuration ? `${Math.max(1, Math.round(data.brief.audioDuration / 60))} min` : briefToday ? "Today's brief" : "Today's brief, one AI call",
        icon: <Icon d={ICONS.brief} />,
        onClick: () => (briefToday ? onNavigate("/brief") : onGenerateBrief()),
      },
    ];
  }, [data, now, onNavigate, onGenerateBrief]);

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

      <div className="relative z-10 mx-auto flex w-full max-w-[880px] flex-1 flex-col items-center justify-center px-4 pb-16 pt-10 md:pb-20">
        <motion.p {...rise(0)} className="eyebrow eyebrow-accent flex items-center gap-3">
          <span>{d ? d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }).toUpperCase() : " "}</span>
          <span className="text-muted-2">·</span>
          <span className="flex items-center gap-1.5 text-foreground" title={error ? "Can't reach the server" : "Live"}>
            <span className="relative flex h-1.5 w-1.5">
              <span key={changedAt} className={`absolute inset-0 rounded-full ${changedAt ? "live-ring" : ""}`} />
              <span className={`relative h-1.5 w-1.5 rounded-full ${live ? "blink-dot" : ""}`} style={{ background: live ? "var(--accent)" : "var(--danger)" }} />
            </span>
            {d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--:--"}
          </span>
        </motion.p>

        <motion.h1 {...rise(1)} className="mt-4 text-center text-[clamp(2.4rem,6vw,4.5rem)]">
          {d ? greeting(d.getHours()) : "Hey"}, <span className="hl">{name}</span>.
        </motion.h1>

        <motion.p {...rise(2)} className="mt-3 min-h-6 text-center text-[15px] text-muted md:text-[17px]">
          {headline(data, now)}
        </motion.p>

        <motion.div {...rise(3)} className="mt-7 w-full max-w-[720px]">
          <CommandBar data={data} onRun={onRun} />
        </motion.div>

        <div className="mt-6 grid w-full grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {tiles.length
            ? tiles.map((t, i) => <TileButton key={t.id} tile={t} index={i} />)
            : Array.from({ length: 6 }).map((_, i) => <div key={i} className="tile-home h-[104px] animate-pulse rounded-3xl md:h-[128px]" />)}
        </div>
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
