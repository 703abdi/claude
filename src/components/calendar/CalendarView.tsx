"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import type { CalendarEvent, Category } from "@/lib/types";
import { api } from "@/lib/api-client";
import { getMonthGrid, isSameDay, toDateKey, MONTH_NAMES, WEEKDAY_NAMES } from "@/lib/calendar-utils";
import { formatClock, parseQuickAdd } from "@/lib/quick-add-parse";
import EventModal from "./EventModal";

type View = "agenda" | "month";
const VIEW_KEY = "calendar-view";
const MOBILE = "(max-width: 767px)";
const REFRESH_MS = 60_000;

export type Connection = { id: "google" | "calendly" | "fathom"; label: string; state: "on" | "off" | "limited" | "error"; detail: string; action?: { label: string; href: string } };

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

const SOURCE_COLOR: Record<string, string> = { google: "var(--info)", calendly: "var(--ok)", fathom: "var(--warn)", feed: "var(--muted)" };

function colorOf(e: CalendarEvent) {
  return e.category?.color ?? SOURCE_COLOR[e.source ?? ""] ?? "var(--accent)";
}

export default function CalendarView({
  initialEvents,
  categories,
  people,
  connections,
  initialDay,
}: {
  initialEvents: CalendarEvent[];
  categories: Category[];
  people: PersonLite[];
  connections: Connection[];
  /** YYYY-MM-DD from ?day=, so a link from Home lands on the right month. */
  initialDay?: string | null;
}) {
  const today = useMemo(() => new Date(), []);
  const focus = useMemo(() => {
    if (initialDay && /^\d{4}-\d{2}-\d{2}$/.test(initialDay)) {
      const [y, m, d] = initialDay.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return null;
  }, [initialDay]);
  const [cursor, setCursor] = useState({ year: (focus ?? today).getFullYear(), month: (focus ?? today).getMonth() });
  const [events, setEvents] = useState(initialEvents);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; date?: Date; event?: CalendarEvent } | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  // Stay current: re-read every minute and whenever the tab comes back.
  const refresh = useCallback(async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/calendar-events?feeds=1&tz=${encodeURIComponent(tz)}`, { cache: "no-store" });
      if (res.ok) setEvents(await res.json());
    } catch {
      // keep what we have
    }
  }, []);
  useEffect(() => {
    const id = setInterval(() => !document.hidden && refresh(), REFRESH_MS);
    const onShow = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [refresh]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(t);
  }, [note]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const days = useMemo(() => getMonthGrid(cursor.year, cursor.month), [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = toDateKey(new Date(e.date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    for (const list of map.values()) list.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    return map;
  }, [events]);

  function goToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
  }
  function prevMonth() {
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  }
  function nextMonth() {
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  }

  function googleNote(saved: CalendarEvent, verb: string) {
    if (saved.google === "saved") return `${verb} and sent to Google Calendar.`;
    if (saved.google === "read-only connection") return `${verb} here. Reconnect Google to send new events there.`;
    if (saved.google && !["not configured", "not connected", "owned by another source"].includes(saved.google)) return `${verb} here, but Google said: ${saved.google}`;
    return `${verb}.`;
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const eventId = String(active.id);
    const dateKey = String(over.id);
    const event = events.find((ev) => ev.id === eventId);
    if (!event || event.readOnly || toDateKey(new Date(event.date)) === dateKey) return;
    const newDate = new Date(`${dateKey}T${event.startTime ?? "12:00"}:00`).toISOString();
    setEvents((prev) => prev.map((ev) => (ev.id === eventId ? { ...ev, date: newDate } : ev)));
    try {
      const saved = await api.calendarEvents.update(eventId, { date: newDate });
      setNote(googleNote(saved, "Moved"));
    } catch {
      setEvents((prev) => prev.map((ev) => (ev.id === eventId ? event : ev)));
      setNote("Couldn't move it.");
    }
  }

  function handleSaved(event: CalendarEvent) {
    setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev.map((e) => (e.id === event.id ? { ...e, ...event } : e)) : [...prev, event]));
    if (!event.readOnly) setNote(googleNote(event, "Saved"));
    setModal(null);
  }

  function handleDeleted(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNote("Deleted.");
    setModal(null);
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-8 md:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1 className="mt-1 whitespace-nowrap text-[26px] font-semibold tracking-[-0.03em] sm:text-[32px]">
            {view === "agenda" ? "Next 14 days" : `${MONTH_NAMES[cursor.month]} ${cursor.year}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {view === "month" && (
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} aria-label="Previous month" className="cal-btn w-9">
                ‹
              </button>
              <button onClick={goToday} className="cal-btn px-3 text-xs">
                Today
              </button>
              <button onClick={nextMonth} aria-label="Next month" className="cal-btn w-9">
                ›
              </button>
            </div>
          )}
          <div role="group" aria-label="Calendar view" className="flex rounded-full border border-border-2 p-0.5">
            {(["month", "agenda"] as View[]).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => chooseView(v)}
                className={`h-8 rounded-full px-3 text-xs font-semibold capitalize ${view === v ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
              >
                {v === "agenda" ? "List" : "Month"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <QuickAdd
        categories={categories}
        people={people}
        onAdded={(ev) => {
          setEvents((prev) => [...prev, ev]);
          const d = new Date(ev.date);
          setCursor({ year: d.getFullYear(), month: d.getMonth() });
          setNote(`${googleNote(ev, "Added")} ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}${ev.startTime ? ` at ${formatClock(ev.startTime)}` : ""}.`);
        }}
        onFull={() => setModal({ mode: "create", date: new Date() })}
      />

      <Connections connections={connections} />

      {view === "agenda" ? (
        <Agenda events={events} onSelectEvent={(e) => setModal({ mode: "edit", event: e })} />
      ) : (
        <DndContext id="calendar-dnd" sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-3xl border border-border bg-border">
            {WEEKDAY_NAMES.map((w) => (
              <div key={w} className="bg-surface py-2 text-center eyebrow">
                {w}
              </div>
            ))}
            {days.map((day) => {
              const key = toDateKey(day);
              return (
                <DayCell
                  key={key}
                  dateKey={key}
                  day={day}
                  inMonth={day.getMonth() === cursor.month}
                  isToday={isSameDay(day, today)}
                  isFocus={!!focus && isSameDay(day, focus)}
                  events={eventsByDay.get(key) ?? []}
                  onCreate={() => setModal({ mode: "create", date: day })}
                  onSelectEvent={(e) => setModal({ mode: "edit", event: e })}
                />
              );
            })}
          </div>
        </DndContext>
      )}

      {note && (
        <div role="status" className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-40 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-border-2 bg-surface-hover px-4 py-3 text-center text-[14px] shadow-xl animate-fade-in md:bottom-6">
          {note}
        </div>
      )}

      {modal && (
        <EventModal
          key={modal.event?.id ?? `new-${modal.date?.getTime()}`}
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

/** One line in, one event out: "Lunch with Ali fri 1pm". The hint shows what it understood before you press Enter. */
function QuickAdd({
  categories,
  people,
  onAdded,
  onFull,
}: {
  categories: Category[];
  people: PersonLite[];
  onAdded: (ev: CalendarEvent) => void;
  onFull: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => {
    if (!value.trim()) return null;
    const p = parseQuickAdd(value, { categories, people });
    // "Lunch with Omar": link the person without needing an @.
    if (p.people.length === 0) {
      const words = p.title.toLowerCase().split(/\s+/);
      const hit = people.find((x) => words.includes(x.name.toLowerCase().split(/\s+/)[0]));
      if (hit) p.people = [hit];
    }
    return p;
  }, [value, categories, people]);

  const whenLabel = parsed
    ? `${parsed.dueLabel ?? "today"}${parsed.dueTime ? ` at ${formatClock(parsed.dueTime)}` : ", all day"}${parsed.people.length ? ` · with ${parsed.people.map((p) => p.name).join(", ")}` : ""}`
    : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed?.title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const day = parsed.dueDate ? new Date(parsed.dueDate) : new Date();
      const key = toDateKey(day);
      const ev = await api.calendarEvents.create({
        title: parsed.title,
        date: new Date(`${key}T${parsed.dueTime ?? "12:00"}:00`).toISOString(),
        startTime: parsed.dueTime,
        allDay: !parsed.dueTime,
        categoryId: parsed.category?.id ?? null,
        personId: parsed.people[0]?.id ?? null,
      });
      onAdded(ev);
      setValue("");
    } catch {
      setError("Couldn't add that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-3">
      <div className="command-bar flex h-14 items-center gap-2 rounded-full pl-5 pr-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          aria-label="Add an event"
          placeholder="Add an event: Lunch with Ali fri 1pm"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-2"
        />
        <button type="button" onClick={onFull} className="hidden h-10 shrink-0 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-foreground sm:block">
          More fields
        </button>
        <button type="submit" disabled={busy || !parsed?.title} className="h-10 shrink-0 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition-opacity disabled:opacity-25">
          Add
        </button>
      </div>
      <p className={`mt-1.5 min-h-[18px] px-5 font-mono text-[11px] ${error ? "text-danger" : "text-muted-2"}`}>
        {error ?? (parsed?.title ? `"${parsed.title}" · ${whenLabel}` : "Type it like you'd say it. Or click any day.")}
      </p>
    </form>
  );
}

function Connections({ connections }: { connections: Connection[] }) {
  const dot: Record<Connection["state"], string> = { on: "bg-ok", limited: "bg-warn", off: "bg-muted-2", error: "bg-danger" };
  return (
    <ul className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 text-[12px] text-muted">
      {connections.map((c) => (
        <li key={c.id} className="flex items-center gap-2" title={c.detail}>
          <span className={`h-1.5 w-1.5 rounded-full ${dot[c.state]}`} />
          <span className="font-medium text-foreground">{c.label}</span>
          <span className="text-muted-2">{c.detail}</span>
          {c.action && (
            <a href={c.action.href} className="font-semibold text-accent hover:underline">
              {c.action.label}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function DayCell({
  dateKey,
  day,
  inMonth,
  isToday,
  isFocus,
  events,
  onCreate,
  onSelectEvent,
}: {
  dateKey: string;
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  isFocus: boolean;
  events: CalendarEvent[];
  onCreate: () => void;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const shown = events.slice(0, 4);
  return (
    <div
      ref={setNodeRef}
      onClick={onCreate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onCreate())}
      aria-label={`Add an event on ${day.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`}
      className={`cal-day group min-h-[88px] cursor-pointer p-1.5 sm:min-h-[116px] sm:p-2 ${isOver ? "bg-surface-hover" : isFocus ? "bg-accent-soft" : "bg-background"} ${!inMonth ? "opacity-35" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] ${isToday ? "bg-accent font-bold text-accent-ink" : "text-muted"}`}>
          {day.getDate()}
        </span>
        <span aria-hidden className="text-[16px] leading-none text-muted-2 opacity-0 transition-opacity group-hover:opacity-100">
          +
        </span>
      </div>
      <div className="mt-1 space-y-1">
        {shown.map((e) => (
          <EventPill
            key={e.id}
            event={e}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelectEvent(e);
            }}
          />
        ))}
        {events.length > shown.length && <p className="px-1 text-[10px] text-muted-2">+{events.length - shown.length} more</p>}
      </div>
    </div>
  );
}

function EventPill({ event, onClick }: { event: CalendarEvent; onClick: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: event.id, disabled: !!event.readOnly });
  const color = colorOf(event);
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      title={event.title}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        color: `color-mix(in srgb, ${color} 80%, white)`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="relative z-10 flex w-full touch-none items-center gap-1 truncate rounded-md px-1.5 py-[3px] text-left text-[11px] font-medium"
    >
      {event.recordingUrl && <span aria-label="Recorded" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      <span className="truncate">
        {event.startTime && !event.allDay ? `${formatClock(event.startTime)} ` : ""}
        {event.title}
      </span>
    </button>
  );
}

function Agenda({ events, onSelectEvent }: { events: CalendarEvent[]; onSelectEvent: (e: CalendarEvent) => void }) {
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
    const map = new Map<string, CalendarEvent[]>();
    for (const d of days) map.set(toDateKey(d), []);
    for (const e of events) map.get(toDateKey(new Date(e.date)))?.push(e);
    for (const v of map.values()) v.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    return map;
  }, [days, events]);

  const todayKey = toDateKey(days[0]);
  const filled = days.filter((d) => toDateKey(d) === todayKey || (byDay.get(toDateKey(d))?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      {filled.map((d) => {
        const key = toDateKey(d);
        const list = byDay.get(key)!;
        const isToday = key === todayKey;
        return (
          <section key={key} className="jarvis-panel">
            <h2 className={`mb-1 px-1 eyebrow ${isToday ? "eyebrow-accent" : ""}`}>
              {isToday ? "Today · " : ""}
              {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </h2>
            {list.length === 0 ? (
              <p className="border-t border-border px-1 py-3 text-[14px] text-muted-2">Nothing scheduled.</p>
            ) : (
              <ul>
                {list.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => onSelectEvent(e)} className="jarvis-row w-full text-left">
                      <span className="w-[72px] shrink-0 font-mono text-[12px]" style={{ color: `color-mix(in srgb, ${colorOf(e)} 80%, white)` }}>
                        {e.allDay || !e.startTime ? "all day" : formatClock(e.startTime)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{e.title}</span>
                        {(e.person || e.location) && <span className="block truncate text-[12px] text-muted-2">{[e.person?.name, e.location].filter(Boolean).join(" · ")}</span>}
                      </span>
                      {e.recordingUrl && <span className="shrink-0 text-[12px] text-accent">Recorded</span>}
                      {e.source && <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-2">{e.source}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
