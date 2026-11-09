"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import CountUp from "@/components/fx/CountUp";
import type { Task } from "@/lib/types";
import { formatDue } from "@/lib/task-dates";
import { formatClock } from "@/lib/quick-add-parse";
import { Card, CheckMark } from "./hub-ui";

const CAP = 8;
const SWIPE_DONE = 90;
const SWIPE_MAX = 140;

export default function TodayList({ tasks, onComplete, onNext, onOpen }: { tasks: Task[]; onComplete: (task: Task) => void; onNext?: (task: Task) => void; onOpen?: (task: Task) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tasks : tasks.slice(0, CAP);
  const hidden = tasks.length - visible.length;
  const overdue = tasks.filter((t) => t.overdue).length;

  return (
    <Card className="p-3 md:p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-2 pt-1">
        <h2 className="text-[18px] font-extrabold tracking-[-0.03em]">
          Today{" "}
          <span className="hl font-mono text-[14px] font-bold tracking-normal">
            <CountUp value={tasks.length} duration={0.5} />
          </span>
        </h2>
        {overdue > 0 && (
          <span className="font-mono text-[12px] font-bold text-danger">
            <CountUp value={overdue} duration={0.5} /> late
          </span>
        )}
      </div>
      {tasks.length === 0 ? (
        <EmptyToday />
      ) : (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {visible.map((t) => (
              <TodayRow key={t.id} task={t} onComplete={onComplete} onNext={onNext} onOpen={onOpen} />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {(hidden > 0 || expanded) && tasks.length > CAP && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-2 w-full rounded-full py-2 text-xs font-semibold text-muted hover:bg-surface-hover hover:text-foreground">
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </Card>
  );
}

function EmptyToday() {
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <motion.span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink"
        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
      >
        <CheckMark on size={22} />
      </motion.span>
      <p className="text-sm font-medium">Nothing left for today.</p>
    </div>
  );
}

export function TodayRow({ task, onComplete, onNext, onOpen }: { task: Task; onComplete: (task: Task) => void; onNext?: (task: Task) => void; onOpen?: (task: Task) => void }) {
  const [checking, setChecking] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"h" | "v" | null>(null);
  const reduced = useReducedMotion();
  const temp = task.id.startsWith("tmp-");

  const due = formatDue(task.dueDate, task.dueTime, task.overdue);

  function complete() {
    if (checking || temp) return;
    setChecking(true);
    setTimeout(() => onComplete(task), reduced ? 0 : 260);
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    axis.current = null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (!axis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    if (axis.current === "h") {
      setSwiping(true);
      setSwipeX(Math.max(0, Math.min(SWIPE_MAX, dx)));
    }
  }
  function onTouchEnd() {
    if (axis.current === "h" && swipeX > SWIPE_DONE) complete();
    setSwiping(false);
    setSwipeX(0);
    start.current = null;
    axis.current = null;
  }

  return (
    <motion.li
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, x: 24, transition: { duration: 0.22 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="relative overflow-hidden rounded-2xl"
    >
      {swipeX > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-4 text-xs font-semibold text-background"
          style={{ width: swipeX, background: "var(--accent)", color: "var(--accent-ink)", opacity: Math.min(1, swipeX / SWIPE_DONE) }}
        >
          Done
        </div>
      )}
      <div
        className="group relative flex min-h-12 items-center gap-1 rounded-2xl border border-transparent bg-surface-2 pr-2 transition-colors duration-[120ms] hover:border-border-2"
        style={{
          transform: swipeX ? `translateX(${swipeX}px)` : undefined,
          transition: swiping ? "none" : "transform 0.18s ease-out",
          touchAction: "pan-y",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {task.overdue && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-danger" />}
        <button
          onClick={complete}
          disabled={temp}
          aria-label={`Complete ${task.title}`}
          className="peer flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
        >
          <motion.span
            animate={checking ? { scale: reduced ? 1 : [0.6, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.28 }}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] transition-colors duration-[120ms] ${
              checking ? "border-accent bg-accent text-accent-ink" : "border-border-2 group-hover:border-accent"
            }`}
          >
            <CheckMark on={checking} size={13} />
          </motion.span>
        </button>
        <div className="min-w-0 flex-1 py-1.5">
          {onOpen ? (
            <button
              onClick={() => onOpen(task)}
              className={`flex w-full min-w-0 items-center gap-2 text-left text-[15px] font-semibold transition-colors ${checking ? "text-muted line-through" : "text-foreground hover:text-accent"}`}
            >
              {task.pinnedToday && !task.overdue && <span aria-label="Pinned" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              <span className="truncate">{task.title}</span>
            </button>
          ) : (
            <Link
              href={`/tasks?highlight=${task.id}`}
              className={`flex items-center gap-2 text-[15px] font-semibold transition-colors ${checking ? "text-muted line-through" : "text-foreground hover:text-accent"}`}
            >
              {task.pinnedToday && !task.overdue && <span aria-label="Pinned" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              <span className="truncate">{task.title}</span>
            </Link>
          )}
          {(due || task.people[0] || temp) && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-2">
              {due && (
                <span className={task.overdue ? "font-semibold text-danger" : due.dueToday && task.dueTime ? "font-semibold text-accent" : ""}>
                  {due.dueToday && task.dueTime ? formatClock(task.dueTime) : due.label}
                </span>
              )}
              {due && task.people[0] && <span aria-hidden>·</span>}
              {task.people[0] && <span className="truncate">{task.people[0].name}</span>}
              {temp && <span>saving</span>}
            </div>
          )}
        </div>
        {onNext && !temp && !checking && (
          <button
            onClick={() => onNext(task)}
            aria-label={`Move ${task.title} to Next`}
            title="Not today. Due in 3 days."
            className="shrink-0 rounded-full px-2.5 py-1 max-md:-my-2 max-md:py-3 font-mono text-[11px] font-semibold text-muted-2 opacity-70 transition-all hover:bg-surface-hover hover:text-foreground hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            next
          </button>
        )}
      </div>
    </motion.li>
  );
}
