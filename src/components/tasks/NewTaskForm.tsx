"use client";

import { useState } from "react";
import type { Task, Category } from "@/lib/types";
import { api } from "@/lib/api-client";

export default function NewTaskForm({
  categories,
  people,
  onCreated,
}: {
  categories: Category[];
  people: { id: string; name: string }[];
  onCreated: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [effort, setEffort] = useState<"LOW" | "MEDIUM" | "HIGH">("LOW");
  const [dueDate, setDueDate] = useState("");
  const [personId, setPersonId] = useState("");
  const [pinnedToday, setPinnedToday] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const task = await api.tasks.create({
        title: title.trim(),
        categoryId: categoryId || undefined,
        effort,
        dueDate: dueDate ? new Date(dueDate + "T09:00:00").toISOString() : undefined,
        personIds: personId ? [personId] : undefined,
        pinnedToday,
      });
      onCreated(task);
      setTitle("");
      setCategoryId("");
      setEffort("LOW");
      setDueDate("");
      setPersonId("");
      setPinnedToday(false);
      setOpen(false);
    } catch {
      setError("Couldn't save that task — your entry is still here. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left border border-dashed border-border rounded-lg px-3 py-2.5 text-sm text-muted hover:text-foreground hover:border-muted-2 transition-colors mb-6"
      >
        + New task
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border bg-surface rounded-lg p-3 mb-6 space-y-2.5 animate-fade-in"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="What needs to happen?"
        className="w-full bg-transparent outline-none font-semibold text-[15px]"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs outline-none"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={effort}
          onChange={(e) => setEffort(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
          className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs outline-none"
        >
          <option value="LOW">Low effort</option>
          <option value="MEDIUM">Medium effort</option>
          <option value="HIGH">High effort</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs outline-none"
        />
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs outline-none"
        >
          <option value="">No person</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted px-1">
          <input type="checkbox" checked={pinnedToday} onChange={(e) => setPinnedToday(e.target.checked)} />
          Pin to Today
        </label>
      </div>
      {error && <p className="text-xs text-status-red">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted px-3 py-1.5">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || submitting}
          className="text-xs font-semibold bg-foreground text-background rounded-md px-3 py-1.5 disabled:opacity-40"
        >
          Create task
        </button>
      </div>
    </form>
  );
}
