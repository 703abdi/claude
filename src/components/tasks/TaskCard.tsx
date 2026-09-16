"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, Category, Effort, TaskStatus } from "@/lib/types";
import { api } from "@/lib/api-client";
import StatusDot, { STATUS_LABEL } from "@/components/shared/StatusDot";
import EffortBars from "@/components/shared/EffortBars";
import TaskDetail from "./TaskDetail";

const EFFORT_CYCLE: Effort[] = ["LOW", "MEDIUM", "HIGH"];
const STATUS_CYCLE: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED"];

function formatDue(dueDate: string | null, overdue: boolean) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((d.getTime() - startOfToday.getTime()) / 86400000);
  let label: string;
  if (diffDays === 0) label = "Today";
  else if (diffDays === 1) label = "Tomorrow";
  else if (diffDays === -1) label = "Yesterday";
  else
    label = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  return { label, overdue };
}

export default function TaskCard({
  task,
  categories,
  people,
  onChange,
  onDelete,
  dragDisabled,
  highlighted,
}: {
  task: Task;
  categories: Category[];
  people: { id: string; name: string }[];
  onChange: (task: Task) => void;
  onDelete: (id: string) => void;
  dragDisabled?: boolean;
  highlighted?: boolean;
}) {
  const [expanded, setExpanded] = useState(!!highlighted);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(!!highlighted);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlighted) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlash(false), 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const due = formatDue(task.dueDate, task.overdue);
  const doneSteps = task.steps.filter((s) => s.done).length;

  async function cycleStatus(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    const idx = STATUS_CYCLE.indexOf(task.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { status: next });
      onChange(updated);
    } finally {
      setBusy(false);
    }
  }

  async function cycleEffort(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    const idx = EFFORT_CYCLE.indexOf(task.effort);
    const next = EFFORT_CYCLE[(idx + 1) % EFFORT_CYCLE.length];
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { effort: next });
      onChange(updated);
    } finally {
      setBusy(false);
    }
  }

  async function togglePinnedToday(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { pinnedToday: !task.pinnedToday });
      onChange(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        cardRef.current = node;
      }}
      style={style}
      className={`group border rounded-lg transition-colors ${
        flash ? "border-foreground bg-surface-2" : "border-border bg-surface"
      } ${task.isBlocked ? "opacity-70" : ""} ${expanded ? "" : "hover:border-muted-2"}`}
    >
      <div
        className="flex items-center gap-3 px-3 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing text-muted-2 hover:text-muted px-0.5 touch-none"
          aria-label="Drag to reorder"
        >
          ⠿
        </span>

        <button onClick={cycleStatus} disabled={busy} className="shrink-0" aria-label={`Status: ${STATUS_LABEL[task.status]}`}>
          <StatusDot status={task.status} className="w-3 h-3" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`font-bold text-[15px] leading-tight truncate ${
                task.status === "COMPLETED" ? "line-through text-muted" : ""
              }`}
            >
              {task.title}
            </span>
            {task.followUpRequired && task.status !== "COMPLETED" && (
              <span className="text-[10px] uppercase tracking-wide text-status-yellow shrink-0">
                follow-up
              </span>
            )}
            {task.isBlocked && (
              <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">blocked</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
            {task.category && (
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.category.color }} />
                {task.category.name}
              </span>
            )}
            {due && (
              <span className={due.overdue ? "text-status-red font-medium" : ""}>
                {due.overdue ? "Overdue · " : ""}
                {due.label}
                {task.dueTime ? ` ${task.dueTime}` : ""}
              </span>
            )}
            {task.steps.length > 0 && (
              <span>
                {doneSteps}/{task.steps.length} steps
              </span>
            )}
            {task.people.length > 0 && <span>{task.people.map((p) => p.name).join(", ")}</span>}
          </div>
        </div>

        <button
          onClick={togglePinnedToday}
          title={task.pinnedToday ? "Remove from Today" : "Pin to Today"}
          className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded border ${
            task.pinnedToday
              ? "border-foreground text-foreground"
              : "border-border text-muted-2 opacity-0 group-hover:opacity-100"
          } transition-opacity`}
        >
          Today
        </button>

        <EffortBars effort={task.effort} onClick={() => {}} className="pointer-events-none" />
      </div>

      {expanded && (
        <TaskDetail
          task={task}
          categories={categories}
          people={people}
          onChange={onChange}
          onDelete={onDelete}
          onCycleEffort={cycleEffort}
        />
      )}
    </div>
  );
}
