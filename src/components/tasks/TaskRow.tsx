"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskStatus } from "@/lib/types";
import { api } from "@/lib/api-client";

const STATUS_CYCLE: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED"];

const STATUS_TAG: Record<TaskStatus, string> = {
  NOT_STARTED: "TODO",
  IN_PROGRESS: "WIP",
  WAITING: "WAIT",
  COMPLETED: "DONE",
};

function daysBetween(a: Date, b: Date) {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((startB.getTime() - startA.getTime()) / 86400000);
}

function formatDue(dueDate: string | null, dueTime: string | null, overdue: boolean) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const now = new Date();
  const diffDays = daysBetween(now, d);
  let label: string;
  if (diffDays === 0) label = dueTime ? dueTime : "today";
  else if (diffDays === 1) label = "tomorrow";
  else if (diffDays === -1) label = "1d late";
  else if (overdue) label = `${Math.abs(diffDays)}d late`;
  else
    label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase();
  return { label, overdue, dueToday: diffDays === 0 };
}

export default function TaskRow({
  task,
  onChange,
  onSelect,
  selected,
  cursor,
  dragDisabled,
  highlighted,
}: {
  task: Task;
  onChange: (task: Task) => void;
  onSelect: (task: Task) => void;
  selected?: boolean;
  cursor?: boolean;
  dragDisabled?: boolean;
  highlighted?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(!!highlighted);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeAxis = useRef<"horizontal" | "vertical" | null>(null);
  const justSwiped = useRef(false);

  const SWIPE_COMPLETE_THRESHOLD = 90;
  const SWIPE_MAX = 140;

  useEffect(() => {
    if (!highlighted) return;
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    onSelect(task);
    const t = setTimeout(() => setFlash(false), 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cursor) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [cursor]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const due = formatDue(task.dueDate, task.dueTime, task.overdue);
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

  async function markComplete(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy || task.status === "COMPLETED") return;
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { status: "COMPLETED" });
      onChange(updated);
    } finally {
      setBusy(false);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (task.status === "COMPLETED") return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    swipeAxis.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (!swipeAxis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (swipeAxis.current === "horizontal") {
      setSwiping(true);
      setSwipeX(Math.max(0, Math.min(SWIPE_MAX, dx)));
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (swipeAxis.current === "horizontal") {
      e.preventDefault();
      justSwiped.current = true;
      if (swipeX > SWIPE_COMPLETE_THRESHOLD) {
        markComplete({ stopPropagation() {} } as React.MouseEvent);
      }
    }
    setSwiping(false);
    setSwipeX(0);
    touchStart.current = null;
    swipeAxis.current = null;
  }

  // Edge bar: overdue/due-today (semantic) takes priority over category (identity)
  const edgeColor = task.overdue
    ? "var(--overdue)"
    : due?.dueToday
      ? "var(--due-today)"
      : task.category?.color || "var(--border)";

  const metaBits: string[] = [];
  if (task.category) metaBits.push(task.category.name.toLowerCase());
  if (task.steps.length > 0) metaBits.push(`${doneSteps}/${task.steps.length}`);
  if (task.people.length > 0) metaBits.push(task.people.map((p) => p.name.toLowerCase()).join("+"));
  if (task.followUpRequired && task.status !== "COMPLETED") metaBits.push("follow-up");
  if (task.isBlocked) metaBits.push("blocked");

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        rowRef.current = node;
      }}
      style={style}
      className={`group relative border-b border-border/60 transition-colors overflow-hidden ${
        flash || selected
          ? "bg-surface-hover"
          : task.overdue
            ? "bg-overdue/[0.06] hover:bg-overdue/[0.1]"
            : "hover:bg-surface-hover"
      } ${task.isBlocked ? "opacity-60" : ""} ${cursor ? "ring-1 ring-inset ring-muted-2" : ""}`}
    >
      {swipeX > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-3 text-background font-mono text-[10px] font-semibold tracking-wide"
          style={{ width: swipeX, backgroundColor: "var(--accent)", opacity: swipeX / SWIPE_COMPLETE_THRESHOLD }}
        >
          DONE
        </div>
      )}

      <div
        className="relative flex items-stretch h-14 md:h-10 cursor-pointer select-none"
        style={{
          transform: swipeX ? `translateX(${swipeX}px)` : undefined,
          transition: swiping ? "none" : "transform 0.2s ease-out",
          touchAction: "pan-y",
        }}
        onClick={() => {
          if (justSwiped.current) {
            justSwiped.current = false;
            return;
          }
          onSelect(task);
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <span
          className="w-[3px] shrink-0"
          style={{ backgroundColor: selected ? "var(--accent)" : edgeColor }}
        />

        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-muted-2 hover:text-muted touch-none shrink-0 w-4 transition-opacity"
          aria-label="Drag to reorder"
        >
          <GripIcon className="w-3 h-3" />
        </span>

        <button
          onClick={cycleStatus}
          disabled={busy}
          className="shrink-0 w-11 flex items-center px-1.5 font-mono text-[10px] tracking-wide text-muted-2 hover:text-muted"
        >
          {STATUS_TAG[task.status]}
        </button>

        <span
          className={`min-w-0 flex-1 flex items-center text-[13.5px] font-medium truncate pr-2 ${
            task.status === "COMPLETED" ? "line-through text-muted" : "text-foreground"
          }`}
        >
          {task.title}
        </span>

        {metaBits.length > 0 && (
          <span className="hidden md:flex items-center font-mono text-[11px] text-muted-2 opacity-70 shrink-0 px-2 truncate max-w-[220px]">
            {metaBits.join(" · ")}
          </span>
        )}

        {/* hover-revealed actions */}
        <span className="hidden sm:flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-1">
          <button
            onClick={togglePinnedToday}
            title={task.pinnedToday ? "Remove from Today" : "Pin to Today"}
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
              task.pinnedToday ? "border-accent/40 text-accent" : "border-border text-muted-2 hover:text-muted"
            }`}
          >
            TODAY
          </button>
          {task.status !== "COMPLETED" && (
            <button
              onClick={markComplete}
              title="Mark complete"
              className="w-5 h-5 flex items-center justify-center rounded border border-border text-muted-2 hover:text-accent hover:border-accent/40"
            >
              <CheckIcon className="w-3 h-3" />
            </button>
          )}
        </span>

        <span
          className={`shrink-0 w-16 text-right font-mono text-[11px] pr-3 ${
            task.overdue ? "text-overdue font-semibold" : due?.dueToday ? "text-due-today font-semibold" : "text-muted-2"
          }`}
        >
          {due?.label ?? ""}
        </span>
      </div>
    </div>
  );
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
