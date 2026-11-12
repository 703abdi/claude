"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent, Category } from "@/lib/types";
import { api } from "@/lib/api-client";
import { toDateKey } from "@/lib/calendar-utils";
import { formatClock } from "@/lib/quick-add-parse";

type PersonLite = { id: string; name: string };

const SOURCE_NAME: Record<string, string> = { google: "Google Calendar", calendly: "Calendly", fathom: "Fathom", feed: "a calendar feed" };
const field = "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] outline-none transition-colors focus:border-accent";

function isUrl(s: string | null | undefined): s is string {
  return !!s && /^https?:\/\//i.test(s);
}

export default function EventModal({
  mode,
  date,
  event,
  categories,
  people,
  onClose,
  onSaved,
  onDeleted,
}: {
  mode: "create" | "edit";
  date?: Date;
  event?: CalendarEvent;
  categories: Category[];
  people: PersonLite[];
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: (id: string) => void;
}) {
  const locked = !!event?.readOnly;
  const initialDateStr = event ? toDateKey(new Date(event.date)) : date ? toDateKey(date) : toDateKey(new Date());

  const [title, setTitle] = useState(event?.title ?? "");
  const [dateStr, setDateStr] = useState(initialDateStr);
  const [startTime, setStartTime] = useState(event?.startTime ?? "");
  const [endTime, setEndTime] = useState(event?.endTime ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [categoryId, setCategoryId] = useState(event?.category?.id ?? "");
  const [personId, setPersonId] = useState(event?.person?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (locked || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const timed = !allDay && startTime;
      const payload = {
        title: title.trim(),
        date: new Date(`${dateStr}T${timed ? startTime : "12:00"}:00`).toISOString(),
        startTime: allDay ? null : startTime || null,
        endTime: allDay ? null : endTime || null,
        allDay: allDay || !startTime,
        location: location || null,
        notes: notes || null,
        categoryId: categoryId || null,
        personId: personId || null,
      };
      const saved = event ? await api.calendarEvents.update(event.id, payload) : await api.calendarEvents.create(payload);
      onSaved(saved);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function linkPerson(id: string) {
    if (!event) return;
    setPersonId(id);
    try {
      onSaved({ ...(await api.calendarEvents.update(event.id, { personId: id || null })), readOnly: true });
    } catch {
      setError("Couldn't save the person.");
    }
  }

  async function remove() {
    if (!event) return;
    try {
      await api.calendarEvents.delete(event.id);
      onDeleted(event.id);
    } catch {
      setError("Couldn't delete it.");
    }
  }

  const when = event
    ? `${new Date(event.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${
        event.allDay || !event.startTime ? "" : ` · ${formatClock(event.startTime)}${event.endTime ? ` to ${formatClock(event.endTime)}` : ""}`
      }`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:px-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "New event" : event?.title}
        className="max-h-[92svh] w-full overflow-y-auto rounded-t-[28px] border border-border-2 bg-surface-2 p-5 animate-slide-up sm:max-w-[440px] sm:rounded-[28px]"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="eyebrow">{mode === "create" ? "New event" : locked ? `From ${SOURCE_NAME[event?.source ?? ""] ?? "another calendar"}` : "Edit event"}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="-m-2 p-2 text-[18px] leading-none text-muted-2 hover:text-foreground">
            ×
          </button>
        </div>

        {locked && event ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{event.title}</h3>
              <p className="mt-1 text-[14px] text-muted">{when}</p>
            </div>
            {event.location &&
              (isUrl(event.location) ? (
                <a href={event.location} target="_blank" rel="noreferrer" className="btn-primary inline-flex h-10 items-center px-4 text-sm">
                  Join
                </a>
              ) : (
                <p className="text-[14px] text-muted">{event.location}</p>
              ))}
            {event.notes && <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-muted">{event.notes}</p>}
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-muted-2">Person</span>
              <select value={personId} onChange={(e) => linkPerson(e.target.value)} className={field}>
                <option value="">Nobody</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <input autoFocus={mode === "create"} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it?" aria-label="Title" className={`${field} text-[17px] font-medium`} />

            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} aria-label="Date" className={field} />
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                All day
              </label>
            </div>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] text-muted-2">Starts</span>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] text-muted-2">Ends</span>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field} />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <select value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Person" className={field}>
                <option value="">No person</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className={field}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Place or link" aria-label="Location" className={field} />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" aria-label="Notes" rows={2} className={`${field} resize-none`} />
          </div>
        )}

        {event?.recordingUrl && (
          <a href={event.recordingUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[14px] hover:border-accent">
            <span>Call recording and notes</span>
            <span className="text-accent">Open in Fathom</span>
          </a>
        )}

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          {mode === "edit" && event?.source !== "calendly" ? (
            confirmDelete ? (
              <span className="flex items-center gap-3 text-[13px]">
                <button type="button" onClick={remove} className="font-semibold text-danger hover:underline">
                  Yes, delete
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted hover:text-foreground">
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-[13px] text-muted-2 hover:text-danger">
                Delete
              </button>
            )
          ) : (
            <span />
          )}
          {locked ? (
            <button type="button" onClick={onClose} className="btn-ghost h-10 px-4 text-sm">
              Close
            </button>
          ) : (
            <button type="submit" disabled={!title.trim() || saving} className="btn-primary h-10 px-5 text-sm">
              {saving ? "Saving" : mode === "create" ? "Add" : "Save"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
