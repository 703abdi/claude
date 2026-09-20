"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, Category, Effort, TaskStatus } from "@/lib/types";
import { api } from "@/lib/api-client";
import StatusDot, { STATUS_LABEL } from "@/components/shared/StatusDot";
import EffortBars from "@/components/shared/EffortBars";
import Avatar from "@/components/shared/Avatar";
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
  allTasks,
  onChange,
  onDelete,
  dragDisabled,
  highlighted,
}: {
  task: Task;
  categories: Category[];
  people: { id: string; name: string }[];
  allTasks: { id: string; title: string }[];
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
      className={`group border rounded-xl transition-colors ${
        flash ? "border-foreground bg-surface-2" : "border-border bg-surface"
      } ${task.isBlocked ? "opacity-70" : ""} ${expanded ? "" : "hover:border-muted-2"}`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="hidden sm:flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-2 hover:text-muted touch-none shrink-0 w-4"
          aria-label="Drag to reorder"
        >
          <GripIcon className="w-3.5 h-3.5" />
        </span>

        <button onClick={cycleStatus} disabled={busy} className="shrink-0" aria-label={`Status: ${STATUS_LABEL[task.status]}`}>
          <StatusDot status={task.status} className="w-3 h-3" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`font-semibold text-[15px] leading-tight truncate ${
                task.status === "COMPLETED" ? "line-through text-muted" : ""
              }`}
            >
              {task.title}
            </span>
            {task.followUpRequired && task.status !== "COMPLETED" && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-status-yellow shrink-0">
                Follow-up
              </span>
            )}
            {task.isBlocked && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted shrink-0">Blocked</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {task.category && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.category.color }} />
                {task.category.name}
              </span>
            )}
            {due && (
              <>
                {task.category && <Dot />}
                <span className={due.overdue ? "text-status-red font-medium" : ""}>
                  {due.overdue ? "Overdue · " : ""}
                  {due.label}
                  {task.dueTime ? ` ${task.dueTime}` : ""}
                </span>
              </>
            )}
            {task.steps.length > 0 && (
              <>
                {(task.category || due) && <Dot />}
                <span>
                  {doneSteps}/{task.steps.length} steps
                </span>
              </>
            )}
          </div>
        </div>

        {task.people.length > 0 && (
          <span className="flex items-center -space-x-1.5 shrink-0">
            {task.people.slice(0, 2).map((p) => (
              <Avatar key={p.id} name={p.name} size="sm" className="ring-2 ring-surface" />
            ))}
            {task.people.length > 2 && (
              <span className="w-8 h-8 rounded-full ring-2 ring-surface bg-surface-2 border border-border flex items-center justify-center text-[10px] font-semibold text-muted">
                +{task.people.length - 2}
              </span>
            )}
          </span>
        )}

        <button
          onClick={togglePinnedToday}
          title={task.pinnedToday ? "Remove from Today" : "Pin to Today"}
          className={`shrink-0 text-[11px] font-medium px-2 py-1 rounded-md border transition-opacity ${
            task.pinnedToday
              ? "border-foreground/30 bg-surface-2 text-foreground"
              : "border-border text-muted-2 opacity-0 group-hover:opacity-100"
          }`}
        >
          Today
        </button>

        <EffortBars effort={task.effort} onClick={() => {}} className="pointer-events-none shrink-0" />
      </div>

      {expanded && (
        <TaskDetail
          task={task}
          categories={categories}
          people={people}
          allTasks={allTasks}
          onChange={onChange}
          onDelete={onDelete}
          onCycleEffort={cycleEffort}
        />
      )}
    </div>
  );
}

function Dot() {
  return <span className="w-0.5 h-0.5 rounded-full bg-muted-2" />;
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <circle cx="5" cy="3" r="1.2" />
      <circle cx="11" cy="3" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="13" r="1.2" />
      <circle cx="11" cy="13" r="1.2" />
    </svg>
  );
}
