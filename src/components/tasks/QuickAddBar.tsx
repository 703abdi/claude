"use client";

import { useState } from "react";
import type { Task, Category } from "@/lib/types";
import { api } from "@/lib/api-client";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function nextWeekday(target: number): Date {
  const d = new Date();
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Very light natural-language parse: trailing "#area" sets category, a trailing
 * day word (today/tomorrow/mon..sun) sets the due date. Everything else is the title. */
function parseQuickAdd(raw: string, categories: Category[]) {
  let text = raw.trim();
  let categoryId: string | undefined;
  let dueDate: string | undefined;

  const tagMatch = text.match(/#(\w+)\b/);
  if (tagMatch) {
    const name = tagMatch[1].toLowerCase();
    const match = categories.find((c) => c.name.toLowerCase().startsWith(name) || name.startsWith(c.name.toLowerCase()));
    if (match) categoryId = match.id;
    text = text.replace(tagMatch[0], "").trim();
  }

  const words = text.split(/\s+/);
  const last = words[words.length - 1]?.toLowerCase().replace(/[.,!]+$/, "");
  if (last === "today") {
    dueDate = new Date().toISOString();
    words.pop();
  } else if (last === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    dueDate = d.toISOString();
    words.pop();
  } else if (last) {
    const idx = WEEKDAYS.indexOf(last.slice(0, 3));
    if (idx !== -1) {
      dueDate = nextWeekday(idx).toISOString();
      words.pop();
    }
  }

  return { title: words.join(" ").trim(), categoryId, dueDate };
}

export default function QuickAddBar({
  categories,
  onCreated,
}: {
  categories: Category[];
  onCreated: (task: Task) => void;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const raw = value.trim();
    if (!raw || submitting) return;
    const { title, categoryId, dueDate } = parseQuickAdd(raw, categories);
    if (!title) return;
    setSubmitting(true);
    setError(null);
    try {
      const task = await api.tasks.create({ title, categoryId, dueDate });
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
