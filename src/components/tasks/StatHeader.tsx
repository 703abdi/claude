"use client";

import { motion, useReducedMotion } from "motion/react";
import CountUp from "@/components/fx/CountUp";
import type { RailView } from "./railView";

const VIEW_LABEL: Record<RailView, string> = {
  FOCUS: "Focus",
  UPCOMING: "Upcoming",
  WAITING: "Waiting on others",
  SOMEDAY: "Someday",
  DONE: "Done",
  AUTO_CLEARED: "Auto-cleared",
};

export default function StatHeader({
  railView,
  doneThisWeek,
  doneThisWeekTotal,
  needDecision,
  focusCount,
  focusLimit,
}: {
  railView: RailView;
  doneThisWeek: number;
  doneThisWeekTotal: number;
  needDecision: number;
  focusCount: number;
  focusLimit: number;
}) {
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
  const pct = doneThisWeekTotal > 0 ? doneThisWeek / doneThisWeekTotal : 0;

  return (
    <div className="glow-accent mb-6 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="eyebrow eyebrow-accent mb-2">{dateLabel}</p>
        <h1 className="text-[clamp(2.2rem,5vw,3.25rem)]">
          {VIEW_LABEL[railView]}
          <span className="hl">.</span>
        </h1>
      </div>
      <div className="flex min-w-0 max-w-full items-center gap-4 md:gap-5">
        <Ring pct={pct} />
        <dl className="flex min-w-0 flex-wrap gap-x-5 gap-y-3">
          <Stat label="done this week" value={doneThisWeek} suffix={`/${doneThisWeekTotal}`} tone="ok" />
          <Stat label="need a decision" value={needDecision} tone={needDecision > 0 ? "danger" : "muted"} />
          <Stat label="today's slots" value={focusCount} suffix={`/${focusLimit}`} tone={focusCount > focusLimit ? "warn" : "accent"} />
        </dl>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  ok: "text-ok",
  danger: "text-danger",
  warn: "text-warn",
  accent: "text-accent",
  muted: "text-foreground",
};

function Stat({ label, value, suffix, tone }: { label: string; value: number; suffix?: string; tone: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 font-mono text-[22px] font-bold leading-none tabular-nums ${TONE[tone]}`}>
        <CountUp value={value} duration={0.6} />
        {suffix && <span className="text-[13px] text-muted-2">{suffix}</span>}
      </dd>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const reduced = useReducedMotion();
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14 shrink-0 -rotate-90" aria-hidden>
      <circle cx="28" cy="28" r={r} stroke="var(--border-2)" strokeWidth="4" fill="none" />
      <motion.circle
        cx="28"
        cy="28"
        r={r}
        stroke="var(--accent)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={reduced ? false : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, pct)) }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}
