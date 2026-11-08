"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import Avatar from "@/components/shared/Avatar";
import type { CalendarEvent } from "@/lib/types";
import type { WaitingGroup } from "@/lib/hub-types";
import { addDaysKey, dayKey } from "@/lib/day";
import { formatClock } from "@/lib/quick-add-parse";
import { Card, CardTitle, shortAge } from "./hub-ui";

function dayName(key: string, todayKey: string) {
  if (key === todayKey) return "Today";
  if (key === addDaysKey(todayKey, 1)) return "Tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}

export function UpNextCard({ events, tz, todayKey }: { events: CalendarEvent[]; tz: string; todayKey: string }) {
  const todayCount = events.filter((e) => dayKey(new Date(e.date), tz) === todayKey).length;
  return (
    <Card>
      <CardTitle
        label="Up next"
        accent="#22e1ff"
        right={
          <span className="flex items-center gap-3 text-[11px]">
            <span className="font-mono text-muted">{todayCount ? `Today · ${todayCount}` : "Nothing today"}</span>
            <Link href="/calendar" className="text-[#22e1ff] hover:underline">
              + event
            </Link>
          </span>
        }
      />
      {events.length === 0 ? (
        <p className="py-4 text-sm text-muted">Nothing on the calendar this week.</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => {
            const key = dayKey(new Date(e.date), tz);
            const color = e.category?.color ?? "#22e1ff";
            return (
              <li key={e.id}>
                <Link href="/calendar" className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
                  <span className="w-14 shrink-0 text-right">
                    <span className="block font-mono text-[13px] tabular-nums" style={{ color }}>
                      {e.allDay || !e.startTime ? "all day" : formatClock(e.startTime)}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider text-muted-2">{dayName(key, todayKey)}</span>
                  </span>
                  <span className="h-8 w-px shrink-0" style={{ background: `linear-gradient(${color}, transparent)` }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{e.title}</span>
                    {(e.person || e.location) && (
                      <span className="block truncate text-[11px] text-muted-2">{[e.person?.name, e.location].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function WaitingCard({ groups, onNudge }: { groups: WaitingGroup[]; onNudge: (g: WaitingGroup) => void }) {
  const [nudged, setNudged] = useState<Record<string, boolean>>({});

  function nudge(g: WaitingGroup) {
    onNudge(g);
    setNudged((n) => ({ ...n, [g.person.id]: true }));
    setTimeout(() => setNudged((n) => ({ ...n, [g.person.id]: false })), 2500);
  }

  return (
    <Card>
      <CardTitle
        label="Waiting on"
        accent="#f5a623"
        right={<span className="font-mono text-[11px] text-muted">{groups.length ? `${groups.length} people` : ""}</span>}
      />
      {groups.length === 0 ? (
        <p className="py-4 text-sm text-muted">Nobody owes you anything.</p>
      ) : (
        <ul className="space-y-1">
          {groups.map((g) => {
            const oldest = g.tasks.reduce<string | null>(
              (acc, t) => (!acc || (t.waitingAt && t.waitingAt < acc) ? t.waitingAt : acc),
              null
            );
            return (
              <li key={g.person.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
                <Link href={`/people/${g.person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={g.person.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{g.person.name}</span>
                    <span className="block truncate text-[11px] text-muted-2">
                      {g.tasks.length === 1 ? g.tasks[0].title : `${g.tasks.length} things`}
                    </span>
                  </span>
                </Link>
                <span className="shrink-0 font-mono text-[11px] text-stat-amber" title="Oldest wait">
                  {shortAge(oldest)}
                </span>
                <button
                  onClick={() => nudge(g)}
                  disabled={nudged[g.person.id]}
                  className="relative h-8 min-w-[64px] shrink-0 overflow-hidden rounded-lg border border-stat-amber/40 px-2.5 text-xs font-semibold text-stat-amber transition hover:bg-stat-amber/10 disabled:border-stat-green/40 disabled:text-stat-green"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={nudged[g.person.id] ? "done" : "idle"}
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                      className="block"
                    >
                      {nudged[g.person.id] ? "nudged" : "Nudge"}
                    </motion.span>
                  </AnimatePresence>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
