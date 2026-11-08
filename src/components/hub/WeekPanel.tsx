"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { HubPayload, Outcome, ScoreField } from "@/lib/hub-types";
import { Card, CardTitle, CheckMark, FlipNumber } from "./hub-ui";

function rangeLabel(startKey: string, endKey: string) {
  const f = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return `${f(startKey)} to ${f(endKey)}`;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

export default function WeekPanel({
  week,
  onOutcomes,
  onScore,
}: {
  week: HubPayload["week"];
  onOutcomes: (outcomes: Outcome[]) => void;
  onScore: (field: ScoreField, delta: number) => void;
}) {
  const slots: Outcome[] = [0, 1, 2].map((i) => week.outcomes[i] ?? { text: "", done: false });

  function save(i: number, next: Outcome) {
    const list = slots.map((o, j) => (j === i ? next : o));
    // Keep filled outcomes in order, drop empty trailing slots.
    while (list.length && !list[list.length - 1].text.trim()) list.pop();
    onOutcomes(list);
  }

  const sb = week.scoreboard.today;
  return (
    <Card>
      <CardTitle label="This week" right={<span className="font-mono text-[12px] text-muted-2">{rangeLabel(week.weekStart, week.weekEnd)}</span>} />
      <ul className="space-y-1">
        {slots.map((o, i) => (
          <OutcomeRow key={`${week.weekStart}-${i}-${o.text}`} index={i} outcome={o} onSave={(next) => save(i, next)} />
        ))}
      </ul>

      <div className="mb-2 mt-5 flex items-center justify-between">
        <span className="eyebrow eyebrow-accent">Scoreboard · today</span>
        <span className="font-mono text-[11px] text-muted-2">
          week {week.scoreboard.week.dials}d · {week.scoreboard.week.convos}c · {week.scoreboard.week.booked}b
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Counter label="Dials" value={sb.dials} onAdd={(d) => onScore("dials", d)} extra={5} />
        <Counter label="Convos" value={sb.convos} onAdd={(d) => onScore("convos", d)} />
        <Counter label="Booked" value={sb.booked} onAdd={(d) => onScore("booked", d)} />
        <CashCounter cents={sb.cashCents} onAdd={(d) => onScore("cashCents", d)} />
      </div>

      <CashRing goal={week.goal} />
    </Card>
  );
}

function OutcomeRow({ index, outcome, onSave }: { index: number; outcome: Outcome; onSave: (o: Outcome) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(outcome.text);
  const empty = !outcome.text.trim();

  function commit() {
    setEditing(false);
    if (text.trim() !== outcome.text) onSave({ text: text.trim(), done: text.trim() ? outcome.done : false });
  }

  return (
    <li className="flex items-start gap-2">
      <button
        onClick={() => !empty && onSave({ ...outcome, done: !outcome.done })}
        disabled={empty}
        aria-label={outcome.done ? "Mark outcome not done" : "Mark outcome done"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-30"
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-[6px] border-[1.5px] transition-colors ${
            outcome.done ? "border-accent bg-accent text-accent-ink" : "border-border-2 hover:border-accent"
          }`}
        >
          <CheckMark on={outcome.done} size={11} />
        </span>
      </button>
      {editing ? (
        <textarea
          autoFocus
          rows={2}
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setText(outcome.text);
              setEditing(false);
            }
          }}
          className="mt-1 min-w-0 flex-1 resize-none rounded-[10px] border border-border-2 bg-surface-hover px-2 py-1 text-sm outline-none focus-visible:outline-2 focus-visible:outline-accent"
        />
      ) : (
        <button
          onClick={() => {
            setText(outcome.text);
            setEditing(true);
          }}
          className={`mt-1.5 min-w-0 flex-1 text-left text-sm leading-snug ${
            empty ? "text-muted-2" : outcome.done ? "text-muted line-through" : "font-medium text-foreground"
          }`}
        >
          {empty ? `Outcome ${index + 1}. Tap to set.` : outcome.text}
        </button>
      )}
    </li>
  );
}

/** Tap = +1. Hold = keeps adding, sent as one update on release. */
function useHoldToAdd(onFlush: (delta: number) => void, step = 1) {
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  const bump = () => {
    pendingRef.current += step;
    setPending(pendingRef.current);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
    timer.current = null;
    interval.current = null;
    const delta = pendingRef.current;
    pendingRef.current = 0;
    setPending(0);
    if (delta) onFlush(delta);
  };
  const start = () => {
    if (timer.current || interval.current) return;
    bump();
    timer.current = setTimeout(() => {
      interval.current = setInterval(bump, 90);
    }, 380);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (interval.current) clearInterval(interval.current);
    },
    []
  );
  return {
    pending,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        start();
      },
      onPointerUp: stop,
      onPointerLeave: () => (timer.current || interval.current) && stop(),
      onPointerCancel: stop,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFlush(step);
        }
      },
    },
  };
}

export function Counter({
  label,
  value,
  onAdd,
  extra,
}: {
  label: string;
  value: number;
  onAdd: (delta: number) => void;
  extra?: number;
}) {
  const { pending, handlers } = useHoldToAdd(onAdd);
  return (
    <div className="tile flex min-w-0 flex-col items-center px-2 pb-2 pt-2.5">
      <span className="eyebrow">{label}</span>
      <FlipNumber value={value + pending} className="my-1 font-mono text-[28px] font-bold leading-8" />
      <motion.button
        {...handlers}
        whileTap={{ scale: 0.88 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
        aria-label={`Add one to ${label}`}
        className="flex h-11 w-full select-none items-center justify-center rounded-full border border-border bg-surface-hover text-xl font-bold text-accent touch-manipulation active:border-accent"
      >
        +
      </motion.button>
      {extra ? (
        <button onClick={() => onAdd(extra)} className="btn-ghost mt-1.5 h-6 px-2.5 text-[11px] text-muted">
          +{extra}
        </button>
      ) : (
        <span className="mt-1.5 h-6" />
      )}
    </div>
  );
}

export function CashCounter({ cents, onAdd }: { cents: number; onAdd: (deltaCents: number) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const add = (dollars: number) => {
    if (!dollars) return;
    onAdd(Math.round(dollars * 100));
    setOpen(false);
    setCustom("");
  };
  return (
    <div className="tile relative flex min-w-0 flex-col items-center px-2 pb-2 pt-2.5">
      <span className="eyebrow">Cash</span>
      <FlipNumber value={money(cents)} className="my-1 max-w-full font-mono text-[24px] font-bold leading-8" />
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.88 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
        aria-label="Add cash collected"
        aria-expanded={open}
        className={`flex h-11 w-full items-center justify-center rounded-full border bg-surface-hover text-xl font-bold text-accent ${
          open ? "border-accent" : "border-border"
        }`}
      >
        +
      </motion.button>
      <span className="mt-1.5 h-6" />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 z-20 mb-2 w-52 rounded-2xl border border-border-2 bg-surface-hover p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.9)]"
          >
            <div className="grid grid-cols-3 gap-1">
              {[100, 500, 1000].map((d) => (
                <button key={d} onClick={() => add(d)} className="rounded-full bg-accent-soft py-2 text-xs font-bold text-accent hover:bg-accent hover:text-accent-ink">
                  +${d >= 1000 ? `${d / 1000}k` : d}
                </button>
              ))}
            </div>
            <form
              className="mt-1.5 flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                add(Number(custom));
              }}
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^\d.-]/g, ""))}
                inputMode="decimal"
                placeholder="$ amount"
                aria-label="Custom cash amount"
                className="min-w-0 flex-1 rounded-[10px] border border-border-2 bg-surface-2 px-2 py-1.5 text-xs outline-none"
              />
              <button className="rounded-full bg-accent px-3 text-xs font-bold text-accent-ink">Add</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CashRing({ goal }: { goal: HubPayload["week"]["goal"] }) {
  const reduced = useReducedMotion();
  const pct = goal.targetCents ? Math.min(1, goal.collectedCents / goal.targetCents) : 0;
  const full = pct >= 1;
  const [y, m, d] = goal.deadline.split("-").map(Number);
  const deadline = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className={`tile mt-4 flex items-center gap-4 p-3 ${full ? "glow-accent" : ""}`}>
      <svg viewBox="0 0 100 100" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border-2)" strokeWidth="10" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="10"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: Math.max(pct, 0.001), opacity: pct > 0 ? 1 : 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="min-w-0">
        <div className="font-mono text-[22px] font-bold leading-7 tabular-nums">
          <span className="hl">{Math.round(pct * 100)}%</span>
        </div>
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground">{money(goal.collectedCents)}</span> of {money(goal.targetCents)} by {deadline}
        </p>
        <p className="text-[12px] text-muted-2">{goal.daysLeft} days left</p>
      </div>
    </div>
  );
}
