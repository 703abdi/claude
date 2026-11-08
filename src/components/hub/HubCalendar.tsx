"use client";

import { useEffect, useState } from "react";
import CalendarView from "@/components/calendar/CalendarView";
import type { CalendarEvent, Category, TaskWithDate } from "@/lib/types";

type PersonLite = { id: string; name: string };

/** The full calendar, embedded in the Hub. Loads your events plus any connected feeds
 * (Google Calendar) and every dated task. Re-mounts when `version` changes so it tracks
 * the hub's live data. */
export default function HubCalendar({ categories, people, version }: { categories: Category[]; people: PersonLite[]; version: string }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [tasks, setTasks] = useState<TaskWithDate[]>([]);

  useEffect(() => {
    let alive = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    Promise.all([
      fetch(`/api/calendar-events?feeds=1&tz=${encodeURIComponent(tz)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/tasks", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([ev, ts]: [CalendarEvent[], TaskWithDate[]]) => {
        if (!alive) return;
        setEvents(ev);
        setTasks(ts.filter((t) => t.dueDate));
      })
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [version]);

  if (events === null) {
    return (
      <div className="card p-5">
        <div className="mb-4 h-3 w-24 animate-pulse rounded-full bg-surface-hover" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface-hover" />
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <CalendarView key={version} initialEvents={events} initialTasksWithDates={tasks} categories={categories} people={people} embedded />
    </div>
  );
}
