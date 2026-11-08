"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import CountUp from "@/components/fx/CountUp";
import type { Task } from "@/lib/types";
import { formatDue } from "@/lib/task-dates";
import { formatClock } from "@/lib/quick-add-parse";
import { Card, CardTitle, CheckMark, Chip } from "./hub-ui";

const CAP = 8;
const SWIPE_DONE = 90;
const SWIPE_MAX = 140;

export default function TodayList({ tasks, onComplete }: { tasks: Task[]; onComplete: (task: Task) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tasks : tasks.slice(0, CAP);
  const hidden = tasks.length - visible.length;
  const overdue = tasks.filter((t) => t.overdue).length;

  return (
    <Card className="p-3 md:p-4">
      <div className="px-1">
        <CardTitle
          label="Today"
          accent="#9b7bff"
          right={
            <span className="font-mono text-[11px] text-muted">
              <CountUp value={tasks.length} duration={0.5} /> open
              {overdue > 0 && (
                <span className="text-overdue">
                  {" · "}
                  <CountUp value={overdue} duration={0.5} /> late
                </span>
              )}
            </span>
          }
        />
      </div>
      {tasks.length === 0 ? (
        <EmptyToday />
      ) : (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {visible.map((t) => (
              <TodayRow key={t.id} task={t} onComplete={onComplete} />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {(hidden > 0 || expanded) && tasks.length > CAP && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-2 w-full rounded-xl py-2 text-xs text-muted hover:bg-white/5 hover:text-foreground">
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
        className="flex h-12 w-12 items-center justify-center rounded-full bg-stat-green/15 text-stat-green shadow-[0_0_28px_-4px_rgba(34,197,94,0.6)]"
        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
      >
        <CheckMark on size={22} />
      </motion.span>
      <p className="text-sm font-medium">Clear for today.</p>
    </div>
  );
}

function TodayRow({ task, onComplete }: { task: Task; onComplete: (task: Task) => void }) {
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
      className="relative overflow-hidden rounded-xl"
    >
      {swipeX > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-4 text-xs font-semibold text-background"
          style={{ width: swipeX, background: "linear-gradient(90deg,#22c55e,#22e1ff)", opacity: Math.min(1, swipeX / SWIPE_DONE) }}
        >
          Done
        </div>
      )}
      <div
        className={`relative flex items-center gap-1 rounded-xl pr-2 transition-colors hover:bg-white/[0.04] ${task.overdue ? "bg-overdue/[0.05]" : ""}`}
        style={{
          transform: swipeX ? `translateX(${swipeX}px)` : undefined,
          transition: swiping ? "none" : "transform 0.18s ease-out",
          touchAction: "pan-y",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          onClick={complete}
          disabled={temp}
          aria-label={`Complete ${task.title}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center md:h-10 md:w-10"
        >
          <motion.span
            animate={checking ? { scale: reduced ? 1 : [0.6, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.28 }}
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
              checking ? "border-stat-green bg-stat-green text-background shadow-[0_0_16px_rgba(34,197,94,0.7)]" : "border-muted-2 hover:border-[#22e1ff]"
            }`}
          >
            <CheckMark on={checking} size={13} />
          </motion.span>
        </button>
        <div className="min-w-0 flex-1 py-2">
          <Link
            href={`/tasks?highlight=${task.id}`}
            className={`block truncate text-[15px] font-medium transition-colors ${checking ? "text-muted line-through" : "hover:text-[#22e1ff]"}`}
          >
            {task.title}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {task.category && <Chip color={task.category.color}>{task.category.name}</Chip>}
            {due && (
              <Chip color={task.overdue ? "#ef4444" : due.dueToday ? "#f5a623" : "#9797a6"}>
                {due.dueToday && task.dueTime ? formatClock(task.dueTime) : due.label}
              </Chip>
            )}
            {task.people.map((p) => (
              <Chip key={p.id} color="#22e1ff">
                @{p.name}
              </Chip>
            ))}
            {task.source?.startsWith("agent:") && <Chip color="#ff4fd8">{task.source.slice(6)}</Chip>}
            {temp && <span className="text-[11px] text-muted-2">saving</span>}
          </div>
        </div>
      </div>
    </motion.li>
  );
}
