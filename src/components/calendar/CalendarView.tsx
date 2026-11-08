"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import type { CalendarEvent, Category, TaskWithDate } from "@/lib/types";
import { api } from "@/lib/api-client";
import { getMonthGrid, isSameDay, toDateKey, MONTH_NAMES, WEEKDAY_NAMES } from "@/lib/calendar-utils";
import EventModal from "./EventModal";
import { formatClock } from "@/lib/quick-add-parse";

type View = "agenda" | "month";
const VIEW_KEY = "calendar-view";
const MOBILE = "(max-width: 767px)";

function subscribeView(cb: () => void) {
  const mq = window.matchMedia(MOBILE);
  mq.addEventListener("change", cb);
  window.addEventListener("storage", cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener("storage", cb);
  };
}
function readView(): View {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    if (v === "agenda" || v === "month") return v;
  } catch {
    // storage blocked, fall through to the screen-size default
  }
  return window.matchMedia(MOBILE).matches ? "agenda" : "month";
}

type PersonLite = { id: string; name: string };

export default function CalendarView({
  initialEvents,
  initialTasksWithDates,
  categories,
  people,
  embedded = false,
}: {
  initialEvents: CalendarEvent[];
  initialTasksWithDates: TaskWithDate[];
  categories: Category[];
  people: PersonLite[];
  /** Inside the Hub: tighter padding, smaller title, no page gutters. */
  embedded?: boolean;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [events, setEvents] = useState(initialEvents);
  const [tasksWithDates] = useState(initialTasksWithDates);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; date?: Date; event?: CalendarEvent } | null>(null);

  const storedView = useSyncExternalStore(subscribeView, readView, () => "month" as View);
  const [chosenView, setChosenView] = useState<View | null>(null);
  const view = chosenView ?? storedView;
  function chooseView(v: View) {
    setChosenView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const days = useMemo(() => getMonthGrid(cursor.year, cursor.month), [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = toDateKey(new Date(e.date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskWithDate[]>();
    for (const t of tasksWithDates) {
      if (t.status === "COMPLETED") continue;
      const key = toDateKey(new Date(t.dueDate));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasksWithDates]);

  function goToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
  }
  function prevMonth() {
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  }
  function nextMonth() {
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const eventId = String(active.id);
    const dateKey = String(over.id);
    const event = events.find((ev) => ev.id === eventId);
    if (!event || event.readOnly || toDateKey(new Date(event.date)) === dateKey) return;

    const [y, m, d] = dateKey.split("-").map(Number);
    const newDate = new Date(y, m - 1, d, 9, 0, 0).toISOString();

    setEvents((prev) => prev.map((ev) => (ev.id === eventId ? { ...ev, date: newDate } : ev)));
    await api.calendarEvents.update(eventId, { date: newDate });
  }

  function handleSaved(event: CalendarEvent) {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === event.id);
      return exists ? prev.map((e) => (e.id === event.id ? event : e)) : [...prev, event];
    });
    setModal(null);
  }

  function handleDeleted(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setModal(null);
  }

  function openEvent(ev: CalendarEvent) {
    if (ev.readOnly) return; // feed events (Google, Calendly) are edited at their source
    setModal({ mode: "edit", event: ev });
  }

  return (
    <div className={embedded ? "px-4 py-4 md:px-5 md:py-5" : "max-w-5xl mx-auto px-4 md:px-6 py-6"}>
      <div className={`flex flex-wrap items-center justify-between gap-3 ${embedded ? "mb-4" : "mb-6"}`}>
        <h1 className={`whitespace-nowrap ${embedded ? "text-[18px] font-extrabold tracking-[-0.03em]" : "text-[24px] sm:text-[28px]"}`}>
          {view === "agenda" ? "Next 14 days" : `${MONTH_NAMES[cursor.month]} ${cursor.year}`}
        </h1>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Calendar view" className="flex rounded-full border border-border-2 p-0.5">
            {(["agenda", "month"] as View[]).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => chooseView(v)}
                className={`px-3 py-1 text-xs font-semibold rounded-full capitalize ${
                  view === v ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {view === "agenda" ? (
            <button
              onClick={() => setModal({ mode: "create", date: new Date() })}
              aria-label="New event"
              className="whitespace-nowrap px-3 py-1.5 text-xs font-bold text-accent-ink bg-accent rounded-full hover:bg-accent-hover"
            >
              +<span className="hidden sm:inline"> Event</span>
            </button>
          ) : (
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="px-2.5 py-1 text-sm text-muted hover:text-foreground border border-border-2 rounded-full">
              ←
            </button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs text-muted hover:text-foreground border border-border-2 rounded-full">
              Today
            </button>
            <button onClick={nextMonth} className="px-2.5 py-1 text-sm text-muted hover:text-foreground border border-border-2 rounded-full">
              →
            </button>
          </div>
          )}
        </div>
      </div>

      {view === "agenda" ? (
        <Agenda events={events} tasks={tasksWithDates} onSelectEvent={openEvent} embedded={embedded} />
      ) : (
        <DndContext id="calendar-dnd" sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-7 gap-px bg-border border border-border rounded-3xl overflow-hidden">
            {WEEKDAY_NAMES.map((w) => (
              <div key={w} className="bg-surface-2 text-center eyebrow py-2">
                {w}
              </div>
            ))}
            {days.map((day) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === cursor.month;
              const isToday = isSameDay(day, today);
              const dayEvents = eventsByDay.get(key) ?? [];
              const dayTasks = tasksByDay.get(key) ?? [];
              return (
                <DayCell
                  key={key}
                  dateKey={key}
                  day={day}
                  inMonth={inMonth}
                  isToday={isToday}
                  events={dayEvents}
                  tasks={dayTasks}
                  onCreate={() => setModal({ mode: "create", date: day })}
                  onSelectEvent={openEvent}
                />
              );
            })}
          </div>
        </DndContext>
      )}

      {modal && (
        <EventModal
          mode={modal.mode}
          date={modal.date}
          event={modal.event}
          categories={categories}
          people={people}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

function DayCell({
  dateKey,
  day,
  inMonth,
  isToday,
  events,
  tasks,
  onCreate,
  onSelectEvent,
}: {
  dateKey: string;
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  tasks: TaskWithDate[];
  onCreate: () => void;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });

  return (
    <div
      ref={setNodeRef}
      onClick={onCreate}
      className={`min-h-[92px] sm:min-h-[110px] p-1.5 bg-background cursor-pointer transition-colors ${
        isOver ? "bg-surface-2" : ""
      } ${!inMonth ? "opacity-40" : ""}`}
    >
      <span
        className={`inline-flex items-center justify-center w-5 h-5 text-[11px] rounded-full ${
          isToday ? "bg-accent text-accent-ink font-bold" : "text-muted"
        }`}
      >
        {day.getDate()}
      </span>
      <div className="mt-1 space-y-1">
        {events.map((e) => (
          <EventPill
            key={e.id}
            event={e}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelectEvent(e);
            }}
          />
        ))}
        {tasks.map((t) => (
          <div
            key={t.id}
            title={t.title}
            className="text-[10px] px-1.5 py-0.5 rounded truncate border border-dashed"
            style={{
              borderColor: t.category?.color ?? "var(--muted-2)",
              color: t.category?.color ?? "var(--muted)",
            }}
          >
            {t.title}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventPill({ event, onClick }: { event: CalendarEvent; onClick: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: event.id, disabled: !!event.readOnly });
  const color = event.category?.color ?? (event.readOnly ? "var(--info)" : "var(--muted-2)");

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        color: `color-mix(in srgb, ${color} 85%, white)`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="w-full text-left text-[10px] px-1.5 py-0.5 rounded-full truncate font-medium touch-none relative z-10"
    >
      {event.startTime ? `${event.startTime} ` : ""}
      {event.title}
    </button>
  );
}

function Agenda({
  events,
  tasks,
  onSelectEvent,
  embedded = false,
}: {
  events: CalendarEvent[];
  tasks: TaskWithDate[];
  onSelectEvent: (e: CalendarEvent) => void;
  embedded?: boolean;
}) {
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, { events: CalendarEvent[]; tasks: TaskWithDate[] }>();
    for (const d of days) map.set(toDateKey(d), { events: [], tasks: [] });
    for (const e of events) map.get(toDateKey(new Date(e.date)))?.events.push(e);
    for (const t of tasks) if (t.status !== "COMPLETED") map.get(toDateKey(new Date(t.dueDate)))?.tasks.push(t);
    for (const v of map.values()) v.events.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    return map;
  }, [days, events, tasks]);

  const todayKey = toDateKey(days[0]);
  const filled = days.filter((d) => {
    const v = byDay.get(toDateKey(d));
    return toDateKey(d) === todayKey || (v && (v.events.length || v.tasks.length));
  });

  return (
    <div className="space-y-5">
      {filled.map((d) => {
        const key = toDateKey(d);
        const v = byDay.get(key)!;
        const isToday = key === todayKey;
        const empty = !v.events.length && !v.tasks.length;
        return (
          <section key={key}>
            <h2
              className={`${embedded ? "" : "sticky top-[57px] md:top-[53px] z-10 -mx-4 px-4 bg-background/90 backdrop-blur"} py-2 eyebrow ${
                isToday ? "eyebrow-accent" : ""
              }`}
            >
              {isToday ? "Today · " : ""}
              {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </h2>
            <ul className={`mt-1.5 space-y-1.5 ${isToday ? "border-l-2 border-accent pl-3" : ""}`}>
              {empty && <li className="text-sm text-muted-2 py-1">Nothing scheduled.</li>}
              {v.events.map((e) => {
                const color = e.category?.color ?? (e.readOnly ? "var(--info)" : "var(--accent)");
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => onSelectEvent(e)}
                      className="w-full flex items-center gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-border-2"
                    >
                      <span className="w-16 shrink-0 font-mono text-xs tabular-nums" style={{ color: `color-mix(in srgb, ${color} 85%, white)` }}>
                        {e.allDay || !e.startTime ? "all day" : formatClock(e.startTime)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{e.title}</span>
                        {(e.person || e.location || e.readOnly) && (
                          <span className="block truncate text-xs text-muted-2">
                            {[e.person?.name, e.location, e.readOnly ? "from your calendar" : null].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
              {v.tasks.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tasks?highlight=${t.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-dashed px-3 py-2.5 hover:bg-surface-hover"
                    style={{ borderColor: t.category?.color ?? "var(--border)" }}
                  >
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-2">{t.dueTime ? formatClock(t.dueTime) : "task"}</span>
                    <span className="min-w-0 truncate text-sm">{t.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
