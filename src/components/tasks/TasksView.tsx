"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Category, Task } from "@/lib/types";
import { api } from "@/lib/api-client";
import { formatClock, parseQuickAdd } from "@/lib/quick-add-parse";
import { toDateKey } from "@/lib/calendar-utils";

type PersonLite = { id: string; name: string };
type Group = "TODAY" | "NEXT" | "LATER" | "WAITING";

const GROUPS: { id: Group; label: string; empty: string }[] = [
  { id: "TODAY", label: "Today", empty: "Nothing for today." },
  { id: "NEXT", label: "Next", empty: "Nothing lined up." },
  { id: "LATER", label: "Later", empty: "Nothing parked." },
  { id: "WAITING", label: "Waiting on someone", empty: "Nobody owes you anything." },
];

function groupOf(t: Task): Group {
  if (t.status === "WAITING") return "WAITING";
  if (t.bucket === "TODAY" || t.bucket === "NOW" || t.overdue) return "TODAY";
  return t.bucket === "NEXT" ? "NEXT" : "LATER";
}

function dueLabel(t: Task) {
  if (!t.dueDate) return null;
  const d = new Date(t.dueDate);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}${t.dueTime ? ` ${formatClock(t.dueTime)}` : ""}`;
}

/** One list, four groups. Add with one line, tick to finish, click a row for notes and a date. */
export default function TasksView({ initialTasks, categories, people }: { initialTasks: Task[]; categories: Category[]; people: PersonLite[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; undo?: () => void } | null>(null);
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params.get("highlight"));
  const [confirmCalls, setConfirmCalls] = useState(false);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(t);
  }, [note]);

  const parsed = useMemo(() => (value.trim() ? parseQuickAdd(value, { categories, people }) : null), [value, categories, people]);
  const grouped = useMemo(() => {
    const map: Record<Group, Task[]> = { TODAY: [], NEXT: [], LATER: [], WAITING: [] };
    for (const t of tasks) map[groupOf(t)].push(t);
    map.TODAY.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.position - b.position);
    return map;
  }, [tasks]);
  const fromCalls = useMemo(() => tasks.filter((t) => t.source?.startsWith("fathom:")), [tasks]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed?.title || busy) return;
    setBusy(true);
    try {
      const created = await api.tasks.create({
        title: parsed.title,
        categoryId: parsed.category?.id ?? null,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        effort: parsed.effort ?? undefined,
        personIds: parsed.people.map((p) => p.id),
        pinnedToday: parsed.pinToday || !parsed.dueDate,
      });
      setTasks((prev) => [...prev, created]);
      setValue("");
    } catch {
      setNote({ text: "Couldn't add that. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function patch(task: Task, data: Record<string, unknown>) {
    try {
      const updated = await api.tasks.update(task.id, data);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      return updated;
    } catch {
      setNote({ text: "Couldn't save that." });
      return null;
    }
  }

  async function complete(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (openId === task.id) setOpenId(null);
    try {
      await api.tasks.update(task.id, { status: "COMPLETED" });
      setNote({
        text: `Done: ${task.title}`,
        undo: async () => {
          const back = await api.tasks.update(task.id, { status: task.status });
          setTasks((prev) => [...prev, back]);
          setNote(null);
        },
      });
    } catch {
      setTasks((prev) => [...prev, task]);
      setNote({ text: "Couldn't save that." });
    }
  }

  async function remove(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    setOpenId(null);
    try {
      await api.tasks.delete(task.id);
      setNote({ text: `Deleted: ${task.title}` });
    } catch {
      setTasks((prev) => [...prev, task]);
      setNote({ text: "Couldn't delete that." });
    }
  }

  async function clearCallTasks() {
    const doomed = fromCalls;
    setConfirmCalls(false);
    setTasks((prev) => prev.filter((t) => !t.source?.startsWith("fathom:")));
    const results = await Promise.allSettled(doomed.map((t) => api.tasks.delete(t.id)));
    const failed = doomed.filter((_, i) => results[i].status === "rejected");
    if (failed.length) setTasks((prev) => [...prev, ...failed]);
    setNote({ text: failed.length ? `Removed ${doomed.length - failed.length}. ${failed.length} couldn't be removed.` : `Removed ${doomed.length} tasks that came from calls.` });
  }

  const hint = parsed?.title
    ? `"${parsed.title}" · ${parsed.dueLabel ?? "today"}${parsed.dueTime ? ` at ${formatClock(parsed.dueTime)}` : ""}${parsed.people.length ? ` · ${parsed.people.map((p) => p.name).join(", ")}` : ""}`
    : "Add a day or a time if it has one: call the bank tue 10am";

  return (
    <div className="mx-auto max-w-[760px] px-4 py-5 md:px-8 md:py-8">
      <p className="eyebrow">Tasks</p>
      <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] sm:text-[32px]">{tasks.length} open</h1>

      <form onSubmit={add} className="mt-5">
        <div className="command-bar flex h-14 items-center gap-2 rounded-full pl-5 pr-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            aria-label="Add a task"
            placeholder="Add a task"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-2"
          />
          <button type="submit" disabled={busy || !parsed?.title} className="h-10 shrink-0 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-25">
            Add
          </button>
        </div>
        <p className="mt-1.5 min-h-[18px] px-5 font-mono text-[11px] text-muted-2">{hint}</p>
      </form>

      {fromCalls.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3 text-[13px] text-muted">
          <span>
            {fromCalls.length} of these were made automatically from call recordings. That is switched off now.
          </span>
          {confirmCalls ? (
            <span className="flex items-center gap-3">
              <button onClick={clearCallTasks} className="font-semibold text-danger hover:underline">
                Yes, remove all {fromCalls.length}
              </button>
              <button onClick={() => setConfirmCalls(false)} className="hover:text-foreground">
                Keep
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmCalls(true)} className="font-semibold text-accent hover:underline">
              Remove them
            </button>
          )}
        </div>
      )}

      <div className="mt-8 space-y-9">
        {GROUPS.map((g) => {
          const list = grouped[g.id];
          if (list.length === 0 && g.id !== "TODAY") return null;
          return (
            <section key={g.id} className="jarvis-panel">
              <h2 className="mb-1 flex items-baseline justify-between px-1">
                <span className={`eyebrow ${g.id === "TODAY" ? "eyebrow-accent" : ""}`}>{g.label}</span>
                {list.length > 0 && <span className="font-mono text-[11px] text-muted-2">{list.length}</span>}
              </h2>
              {list.length === 0 ? (
                <p className="border-t border-border px-1 py-3 text-[14px] text-muted-2">{g.empty}</p>
              ) : (
                <ul>
                  {list.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      open={openId === t.id}
                      onToggle={() => setOpenId((id) => (id === t.id ? null : t.id))}
                      onComplete={() => complete(t)}
                      onPatch={(data) => patch(t, data)}
                      onDelete={() => remove(t)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {note && (
        <div role="status" className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[min(92vw,520px)] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-border-2 bg-surface-hover px-4 py-3 text-[14px] shadow-xl animate-fade-in md:bottom-6">
          <span className="min-w-0 truncate">{note.text}</span>
          {note.undo && (
            <button onClick={note.undo} className="shrink-0 font-semibold text-accent hover:underline">
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  open,
  onToggle,
  onComplete,
  onPatch,
  onDelete,
}: {
  task: Task;
  open: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onPatch: (data: Record<string, unknown>) => Promise<Task | null>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const due = dueLabel(task);
  const who = task.followUpPerson?.name ?? task.people[0]?.name ?? null;
  const field = "rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent";

  return (
    <li className="border-b border-border">
      <div className="flex min-h-[52px] items-center gap-3 px-1 py-2">
        <button onClick={onComplete} aria-label={`Mark done: ${task.title}`} className="task-check shrink-0" />
        <button onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{task.title}</span>
            {who && <span className="block truncate text-[12px] text-muted-2">{task.status === "WAITING" ? `Waiting on ${who}` : who}</span>}
          </span>
          {due && <span className={`shrink-0 font-mono text-[12px] ${task.overdue ? "text-danger" : "text-muted-2"}`}>{task.overdue ? `late · ${due}` : due}</span>}
        </button>
      </div>
      {open && (
        <div className="space-y-3 px-1 pb-4 pl-[38px] animate-fade-in">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && onPatch({ title: title.trim() })}
            aria-label="Task title"
            className={`${field} w-full`}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (task.notes ?? "") && onPatch({ notes: notes || null })}
            placeholder="Notes"
            aria-label="Notes"
            rows={3}
            className={`${field} w-full resize-y`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-muted">
              Due
              <input
                type="date"
                defaultValue={task.dueDate ? toDateKey(new Date(task.dueDate)) : ""}
                onChange={(e) => onPatch({ dueDate: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null, pinnedToday: false })}
                className={field}
              />
            </label>
            {task.status !== "WAITING" && (
              <button onClick={() => onPatch({ pinnedToday: !task.pinnedToday })} className="text-[13px] text-muted hover:text-foreground">
                {task.pinnedToday ? "Take off today" : "Do today"}
              </button>
            )}
            <button onClick={onDelete} className="ml-auto text-[13px] text-muted-2 hover:text-danger">
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
