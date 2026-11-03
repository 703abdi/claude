"use client";

import { useState } from "react";
import type { CalendarEvent, Category } from "@/lib/types";
import { api } from "@/lib/api-client";
import { toDateKey } from "@/lib/calendar-utils";

type PersonLite = { id: string; name: string };

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
  const initialDateStr = event ? event.date.slice(0, 10) : date ? toDateKey(date) : toDateKey(new Date());

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        date: new Date(dateStr + "T09:00:00").toISOString(),
        startTime: startTime || null,
        endTime: endTime || null,
        allDay,
        location: location || null,
        notes: notes || null,
        categoryId: categoryId || null,
        personId: personId || null,
      };
      const saved = event
        ? await api.calendarEvents.update(event.id, payload)
        : await api.calendarEvents.create(payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event) return;
    if (!confirm(`Delete "${event.title}"?`)) return;
    await api.calendarEvents.delete(event.id);
    onDeleted(event.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-surface border border-border rounded-lg p-4 animate-fade-in space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">{mode === "create" ? "New event" : "Edit event"}</h3>
          <button type="button" onClick={onClose} className="text-muted-2 hover:text-foreground text-sm">
            ✕
          </button>
        </div>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm outline-none focus:border-muted-2"
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted px-1">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
        </div>

        {!allDay && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
          >
            <option value="">No person</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
          className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm outline-none"
        />

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          rows={2}
          className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-2 text-sm resize-none outline-none"
        />

        <div className="flex items-center justify-between pt-1">
          {mode === "edit" ? (
            <button type="button" onClick={remove} className="text-xs text-status-red hover:underline">
              Delete
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="text-xs font-semibold bg-foreground text-background rounded-md px-3 py-1.5 disabled:opacity-40"
          >
            {mode === "create" ? "Create event" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
