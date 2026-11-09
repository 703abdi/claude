"use client";

import type { Task } from "@/lib/types";
import { formatDue } from "@/lib/task-dates";
import { formatClock } from "@/lib/quick-add-parse";
import Popup from "./Popup";
import { Chip } from "./hub-ui";

/** Tap a task anywhere on Home and this opens: what it is, where it came from, who it is with,
 * and the three things you can do with it. Nothing leaves the page. */
export default function TaskSheet({
  task,
  onClose,
  onDone,
  onNext,
  onDrop,
  onOpenFull,
}: {
  task: Task | null;
  onClose: () => void;
  onDone: (task: Task) => void;
  onNext: (task: Task) => void;
  onDrop: (task: Task) => void;
  onOpenFull: (task: Task) => void;
}) {
  const due = task ? formatDue(task.dueDate, task.dueTime, task.overdue) : null;
  const lines = (task?.notes ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const steps = task?.steps ?? [];
  const doneSteps = steps.filter((s) => s.done).length;

  return (
    <Popup open={!!task} onClose={onClose} eyebrow={task?.overdue ? "Late" : task?.pinnedToday ? "Today" : "Task"} title={task?.title ?? ""}>
      {task && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {due && <Chip tone={task.overdue ? "danger" : due.dueToday ? "gold" : "neutral"}>{due.dueToday && task.dueTime ? `today ${formatClock(task.dueTime)}` : `due ${due.label}`}</Chip>}
            {task.people.map((p) => (
              <Chip key={p.id}>{p.name}</Chip>
            ))}
            {task.category && <Chip>{task.category.name}</Chip>}
            {steps.length > 0 && <Chip tone={doneSteps === steps.length ? "ok" : "neutral"}>{doneSteps}/{steps.length} steps</Chip>}
          </div>

          {task.description && <p className="text-[15px] leading-relaxed text-foreground">{task.description}</p>}

          {lines.length > 0 && (
            <div className="tile p-3">
              <p className="eyebrow mb-1.5">Where it came from</p>
              <ul className="space-y-1 text-[14px] text-muted">
                {lines.map((l, i) =>
                  /^https?:\/\//.test(l) ? (
                    <li key={i}>
                      <a href={l} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4 break-all">
                        {l.replace(/^https?:\/\//, "").slice(0, 60)}
                      </a>
                    </li>
                  ) : (
                    <li key={i}>{l}</li>
                  )
                )}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <ul className="space-y-1">
              {steps.map((s) => (
                <li key={s.id} className={`flex items-center gap-2 text-[14px] ${s.done ? "text-muted line-through" : ""}`}>
                  <span className={`h-3.5 w-3.5 rounded-full border ${s.done ? "border-accent bg-accent" : "border-border-2"}`} aria-hidden />
                  {s.title}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={() => onDone(task)} className="btn-primary h-11 px-5 text-sm">
              Done
            </button>
            <button onClick={() => onNext(task)} className="btn-ghost h-11 px-4 text-sm text-muted">
              Not now
            </button>
            <button onClick={() => onDrop(task)} className="btn-ghost h-11 px-4 text-sm text-muted">
              Drop
            </button>
            <button onClick={() => onOpenFull(task)} className="ml-auto font-mono text-[11px] text-muted hover:text-accent">
              edit in Tasks
            </button>
          </div>
        </div>
      )}
    </Popup>
  );
}
