"use client";

import { useState } from "react";
import type { Task, Category } from "@/lib/types";
import { api } from "@/lib/api-client";
import { parseQuickAdd, type PersonLite } from "@/lib/quick-add-parse";

export default function QuickAddBar({
  categories,
  people = [],
  onCreated,
}: {
  categories: Category[];
  people?: PersonLite[];
  onCreated: (task: Task) => void;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const raw = value.trim();
    if (!raw || submitting) return;
    const p = parseQuickAdd(raw, { categories, people });
    if (!p.title) return;
    setSubmitting(true);
    setError(null);
    try {
      const task = await api.tasks.create({
        title: p.title,
        categoryId: p.category?.id,
        dueDate: p.dueDate,
        dueTime: p.dueTime,
        effort: p.effort ?? undefined,
        personIds: p.people.map((x) => x.id),
        pinnedToday: p.pinToday || undefined,
      });
      onCreated(task);
      setValue("");
    } catch {
      setError("Couldn't save that — still here, try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 focus-within:border-accent/50 transition-colors">
        <PlusIcon className="w-4 h-4 text-muted-2 shrink-0" />
        <input
          id="new-task-trigger"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={submitting}
          placeholder="Add a task. Try: Send Sarah her report fri #clients"
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-muted-2"
        />
        <span className="hidden sm:inline text-[11px] font-mono text-muted-2 shrink-0">ENTER</span>
      </div>
      {error && <p className="text-xs text-overdue mt-1.5 px-1">{error}</p>}
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
