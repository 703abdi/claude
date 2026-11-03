"use client";

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
  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    .toUpperCase();

  return (
    <div className="mb-5">
      <p className="font-mono text-[11px] tracking-wide text-muted-2 mb-1">{dateLabel}</p>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">{VIEW_LABEL[railView]}</h1>
        <div className="flex items-center gap-2.5 flex-wrap">
          <StatCard color="stat-green" value={`${doneThisWeek}/${doneThisWeekTotal}`} label="done this week" />
          <StatCard color="stat-amber" value={String(needDecision)} label="need a decision" />
          <StatCard color="stat-blue" value={`${focusCount}/${focusLimit}`} label="today's slots" />
        </div>
      </div>
    </div>
  );
}

const STAT_CLASSES = {
  "stat-green": { card: "border-stat-green/25 bg-stat-green/10", text: "text-stat-green" },
  "stat-amber": { card: "border-stat-amber/25 bg-stat-amber/10", text: "text-stat-amber" },
  "stat-blue": { card: "border-stat-blue/25 bg-stat-blue/10", text: "text-stat-blue" },
} as const;

function StatCard({
  color,
  value,
  label,
}: {
  color: keyof typeof STAT_CLASSES;
  value: string;
  label: string;
}) {
  const cls = STAT_CLASSES[color];
  return (
    <div className={`rounded-xl border px-3.5 py-2 ${cls.card}`}>
      <p className={`text-lg font-bold leading-none ${cls.text}`}>{value}</p>
      <p className="text-[11px] text-muted mt-1 whitespace-nowrap">{label}</p>
    </div>
  );
}
