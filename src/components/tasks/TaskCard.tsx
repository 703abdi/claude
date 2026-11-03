"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/types";
import { api } from "@/lib/api-client";
import { formatDue } from "@/lib/task-dates";

export default function TaskCard({
  task,
  onChange,
  onSelect,
  selected,
  cursor,
  showFocusActions,
  dragDisabled,
  highlighted,
}: {
  task: Task;
  onChange: (task: Task) => void;
  onSelect: (task: Task) => void;
  selected?: boolean;
  cursor?: boolean;
  showFocusActions?: boolean;
  dragDisabled?: boolean;
  highlighted?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(!!highlighted);
  const [completing, setCompleting] = useState(false);
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
  const totalSteps = task.steps.length;
  const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  async function completeWithAnimation() {
    if (busy || completing || task.status === "COMPLETED") return;
    const reducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setCompleting(true);
    if (!reducedMotion) await new Promise((r) => setTimeout(r, 300));
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { status: "COMPLETED" });
      onChange(updated);
    } finally {
      setBusy(false);
      setCompleting(false);
    }
  }

  async function toggleComplete(e: React.MouseEvent) {
    e.stopPropagation();
    if (task.status === "COMPLETED") {
      setBusy(true);
      try {
        const updated = await api.tasks.update(task.id, { status: "NOT_STARTED" });
        onChange(updated);
      } finally {
        setBusy(false);
      }
      return;
    }
    completeWithAnimation();
  }

  async function startFocus(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const updated = await api.tasks.update(task.id, { status: "IN_PROGRESS" });
      onChange(updated);
    } finally {
      setBusy(false);
    }
    onSelect(task);
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
      if (swipeX > SWIPE_COMPLETE_THRESHOLD) completeWithAnimation();
    }
    setSwiping(false);
    setSwipeX(0);
    touchStart.current = null;
    swipeAxis.current = null;
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        rowRef.current = node;
      }}
      style={style}
      className={`group relative rounded-xl border overflow-hidden transition-colors ${
        flash || selected ? "border-accent/50 bg-surface-hover" : "border-border bg-surface hover:border-muted-2/40"
      } ${task.isBlocked ? "opacity-60" : ""} ${cursor ? "ring-1 ring-inset ring-accent/40" : ""} ${
        completing ? "animate-complete-fade pointer-events-none" : ""
      }`}
    >
      {swipeX > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-4 text-background font-semibold text-xs"
          style={{ width: swipeX, backgroundColor: "var(--accent)", opacity: swipeX / SWIPE_COMPLETE_THRESHOLD }}
        >
          Done
        </div>
      )}

      <div
        className="relative flex items-center gap-3.5 px-4 py-3.5 cursor-pointer select-none"
        style={{
          transform: swipeX ? `translateX(${swipeX}px)` : undefined,
          transition: swiping ? "none" : "transform 0.18s ease-out",
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
        <button
          onClick={toggleComplete}
          disabled={busy}
          className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            task.status === "COMPLETED" || completing
              ? "bg-accent border-accent"
              : "border-muted-2 hover:border-accent"
          }`}
          title={task.status === "COMPLETED" ? "Mark not done" : "Mark complete"}
        >
          {(task.status === "COMPLETED" || completing) && (
            <CheckIcon className="w-3 h-3 text-background animate-complete-pop" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`text-[15px] font-semibold truncate ${
              task.status === "COMPLETED" || completing ? "line-through text-muted" : "text-foreground"
            }`}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {task.category && (
              <span
                className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${task.category.color}22`, color: task.category.color }}
              >
                {task.category.name}
              </span>
            )}
            {totalSteps > 0 && (
              <span className="text-[11px] text-muted-2">
                {doneSteps} of {totalSteps} steps
              </span>
            )}
            {task.status === "WAITING" && (
              <span className="text-[11px] font-medium text-stat-amber">waiting</span>
            )}
            {due && (
              <span
                className={`text-[11px] font-medium ${
                  task.overdue ? "text-overdue" : due.dueToday ? "text-stat-amber" : "text-muted-2"
                }`}
              >
                {due.label}
              </span>
            )}
          </div>
        </div>

        {showFocusActions && task.status !== "COMPLETED" && (
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            {totalSteps > 0 && (
              <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
            <button
              onClick={startFocus}
              disabled={busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-stat-blue text-white hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Start focus
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
