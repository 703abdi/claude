"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import type { WaitingGroup } from "@/lib/hub-types";
import { addDaysKey, dayKey } from "@/lib/day";
import { formatClock } from "@/lib/quick-add-parse";
import { Card, CardTitle, shortAge } from "./hub-ui";

function dayName(key: string, todayKey: string) {
  if (key === todayKey) return "Today";
  if (key === addDaysKey(todayKey, 1)) return "Tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
  return `${wd} ${d}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UpNextCard({ events, tz, todayKey }: { events: CalendarEvent[]; tz: string; todayKey: string }) {
  const groups: { key: string; items: CalendarEvent[] }[] = [];
  for (const e of events) {
    const key = dayKey(new Date(e.date), tz);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, items: [e] });
  }
  const todayCount = groups.find((g) => g.key === todayKey)?.items.length ?? 0;

  return (
    <Card>
      <CardTitle
        label="Up next"
        right={
          <span className="flex items-center gap-3 text-[12px]">
            <span className="font-mono text-muted-2">{todayCount ? `Today · ${todayCount}` : "Nothing today"}</span>
            <Link href="/calendar" className="font-semibold text-accent hover:underline">
              + event
            </Link>
          </span>
        }
      />
      {events.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nothing on the calendar this week.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isToday = g.key === todayKey;
            return (
              <div key={g.key}>
                <div className={`eyebrow mb-1 ${isToday ? "eyebrow-accent" : ""}`}>{dayName(g.key, todayKey)}</div>
                <ul>
                  {g.items.map((e) => (
                    <li key={e.id}>
                      <Link href="/calendar" className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-hover">
                        <span className={`w-16 shrink-0 font-mono text-[13px] font-bold tabular-nums ${isToday ? "text-accent" : "text-muted"}`}>
                          {e.allDay || !e.startTime ? "all day" : formatClock(e.startTime)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{e.title}</span>
                          {(e.person || e.location) && (
                            <span className="block truncate text-[12px] text-muted">{[e.person?.name, e.location].filter(Boolean).join(" · ")}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function WaitingCard({ groups, onNudge }: { groups: WaitingGroup[]; onNudge: (g: WaitingGroup) => void }) {
  const [nudged, setNudged] = useState<Record<string, boolean>>({});

  function nudge(g: WaitingGroup) {
    onNudge(g);
    setNudged((n) => ({ ...n, [g.person.id]: true }));
    setTimeout(() => setNudged((n) => ({ ...n, [g.person.id]: false })), 2000);
  }

  return (
    <Card>
      <CardTitle
        label="Waiting on"
        right={
          <span className="flex items-center gap-2 font-mono text-[12px] text-muted-2">
            {groups.length === 1 ? "1 person" : groups.length ? `${groups.length} people` : ""}
            <Link href="/people" className="font-semibold text-accent hover:underline">
              People
            </Link>
          </span>
        }
      />
      {groups.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nobody owes you anything.</p>
      ) : (
        <ul className="space-y-1">
          {groups.map((g) => {
            const oldest = g.tasks.reduce<string | null>((acc, t) => (!acc || (t.waitingAt && t.waitingAt < acc) ? t.waitingAt : acc), null);
            const done = nudged[g.person.id];
            return (
              <li key={g.person.id} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-hover">
                <Link href={`/people/${g.person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-hover text-xs font-bold text-foreground">
                    {initials(g.person.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{g.person.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {g.tasks.length === 1 ? "1 task" : `${g.tasks.length} tasks`} · {shortAge(oldest)}
                    </span>
                  </span>
                </Link>
                <button
                  onClick={() => nudge(g)}
                  disabled={done}
                  className={`relative h-8 min-w-[72px] shrink-0 overflow-hidden rounded-full border px-3 text-xs font-semibold transition-colors ${
                    done ? "border-transparent bg-accent-soft text-accent" : "border-border-2 text-foreground hover:border-accent hover:text-accent"
                  }`}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={done ? "done" : "idle"}
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                      className="block"
                    >
                      {done ? "nudged" : "Nudge"}
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
