"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { api } from "@/lib/api-client";
import { daysPastDue, AUTO_CLEAR_AFTER_DAYS } from "@/lib/task-dates";

const SHOWN_BY_DEFAULT = 4;

export default function DecisionBanner({
  tasks,
  onChange,
  onSelect,
}: {
  tasks: Task[];
  onChange: (task: Task) => void;
  onSelect: (task: Task) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  if (tasks.length === 0) return null;

  const visible = expanded ? tasks : tasks.slice(0, SHOWN_BY_DEFAULT);
  const remaining = tasks.length - visible.length;

  async function moveAllToTomorrow() {
    setBusyAll(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    try {
      const updated = await Promise.all(
        tasks.map((t) => api.tasks.update(t.id, { dueDate: tomorrow.toISOString() }))
      );
      updated.forEach(onChange);
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="card mb-5 border-warn/40 p-4 hover:border-warn/60">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="eyebrow mb-1 text-warn">Needs a decision</p>
          <p className="text-[15px] font-bold text-foreground">{tasks.length === 1 ? "1 task slipped. Decide it." : `${tasks.length} tasks slipped. Decide each one.`}</p>
          <p className="text-[13px] text-muted mt-0.5">
            Untouched for {AUTO_CLEAR_AFTER_DAYS} days past due? It auto-clears to the Auto-cleared bin. Restore
            anytime.
          </p>
        </div>
        <button
          onClick={moveAllToTomorrow}
          disabled={busyAll}
          className="btn-ghost text-xs px-3.5 py-2 whitespace-nowrap disabled:opacity-50"
        >
          Move all to tomorrow
        </button>
      </div>

      <div className="mt-3 divide-y divide-border">
        {visible.map((task) => (
          <DecisionRow key={task.id} task={task} onChange={onChange} onSelect={onSelect} />
        ))}
      </div>

      {remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-medium text-muted hover:text-foreground"
        >
          Show {remaining} more
        </button>
      )}
    </div>
  );
}

function DecisionRow({
  task,
  onChange,
  onSelect,
}: {
  task: Task;
  onChange: (task: Task) => void;
  onSelect: (task: Task) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const late = daysPastDue(task.dueDate) ?? 0;
  const clearsIn = Math.max(0, AUTO_CLEAR_AFTER_DAYS - late);
  const person = task.people[0]?.name;

  async function moveToday() {
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { dueDate: new Date().toISOString(), pinnedToday: true });
      onChange(updated);
    } finally {
      setBusy(false);
    }
  }

  async function drop() {
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { dueDate: null, pinnedToday: false });
      onChange(updated);
    } finally {
      setBusy(false);
    }
  }

  async function pickDate(value: string) {
    if (!value) return;
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { dueDate: new Date(value + "T09:00:00").toISOString() });
      onChange(updated);
      setPicking(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 py-2.5 flex-wrap">
      {task.category && (
        <span
          className="shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `color-mix(in srgb, ${task.category.color} 18%, transparent)`, color: `color-mix(in srgb, ${task.category.color} 85%, white)` }}
        >
          {task.category.name}
        </span>
      )}
      <button onClick={() => onSelect(task)} className="min-w-0 text-left flex-1 basis-[220px]">
        <p className="text-sm font-semibold text-foreground truncate">{task.title}</p>
        <p className="text-[11px] text-muted-2 truncate">
          {person ? `with ${person} · ` : ""}
          {late}d late
        </p>
      </button>
      <span className="hidden md:inline text-[11px] font-mono text-muted-2 shrink-0">clears in {clearsIn}d</span>
      {picking ? (
        <input
          type="date"
          autoFocus
          disabled={busy}
          onChange={(e) => pickDate(e.target.value)}
          onBlur={() => setPicking(false)}
          className="bg-surface-2 border border-border rounded px-2 py-1 text-xs outline-none"
        />
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={moveToday}
            disabled={busy}
            className="text-xs font-bold px-3 py-1 rounded-full bg-accent text-accent-ink hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            Today
          </button>
          <button
            onClick={() => setPicking(true)}
            disabled={busy}
            className="text-xs font-medium px-2.5 py-1 rounded-full border border-border-2 text-muted hover:text-foreground transition-colors"
          >
            Pick date
          </button>
          <button
            onClick={drop}
            disabled={busy}
            className="text-xs font-medium px-2 py-1 text-muted-2 hover:text-foreground transition-colors"
          >
            Drop
          </button>
        </div>
      )}
    </div>
  );
}
