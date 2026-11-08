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
      <CardTitle label="This week" accent="#ff4fd8" right={<span className="font-mono text-[11px] text-muted">{rangeLabel(week.weekStart, week.weekEnd)}</span>} />
      <ul className="space-y-1">
        {slots.map((o, i) => (
          <OutcomeRow key={`${week.weekStart}-${i}-${o.text}`} index={i} outcome={o} onSave={(next) => save(i, next)} />
        ))}
      </ul>

      <div className="mt-4 mb-2 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.18em] text-muted-2">
        <span>Scoreboard · today</span>
        <span className="normal-case tracking-normal">
          week {week.scoreboard.week.dials}d · {week.scoreboard.week.convos}c · {week.scoreboard.week.booked}b
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Counter label="Dials" value={sb.dials} color="#22e1ff" onAdd={(d) => onScore("dials", d)} extra={5} />
        <Counter label="Convos" value={sb.convos} color="#9b7bff" onAdd={(d) => onScore("convos", d)} />
        <Counter label="Booked" value={sb.booked} color="#22c55e" onAdd={(d) => onScore("booked", d)} />
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
        className="flex h-9 w-9 shrink-0 items-center justify-center disabled:opacity-30"
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
            outcome.done ? "border-[#ff4fd8] bg-[#ff4fd8] text-background shadow-[0_0_12px_rgba(255,79,216,0.6)]" : "border-muted-2"
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
          className="mt-1 min-w-0 flex-1 resize-none rounded-lg border border-[#ff4fd8]/40 bg-black/30 px-2 py-1 text-sm outline-none"
        />
      ) : (
        <button
          onClick={() => {
            setText(outcome.text);
            setEditing(true);
          }}
          className={`mt-1.5 min-w-0 flex-1 text-left text-sm leading-snug ${
            empty ? "text-muted-2 italic" : outcome.done ? "text-muted line-through" : ""
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

function Counter({
  label,
  value,
  color,
  onAdd,
  extra,
}: {
  label: string;
  value: number;
  color: string;
  onAdd: (delta: number) => void;
  extra?: number;
}) {
  const { pending, handlers } = useHoldToAdd(onAdd);
  return (
    <div className="flex min-w-0 flex-col items-center rounded-2xl border border-white/[0.06] bg-black/20 px-1 pb-1.5 pt-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-2">{label}</span>
      <FlipNumber value={value + pending} className="my-0.5 font-mono text-2xl font-bold" />
      <motion.button
        {...handlers}
        whileTap={{ scale: 0.82 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
        aria-label={`Add one to ${label}`}
        className="flex h-11 w-full select-none items-center justify-center rounded-xl text-xl font-bold touch-manipulation"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color, boxShadow: `inset 0 0 0 1px ${color}44` }}
      >
        +
      </motion.button>
      {extra ? (
        <button onClick={() => onAdd(extra)} className="mt-1 text-[11px] font-semibold text-muted hover:text-foreground">
          +{extra}
        </button>
      ) : (
        <span className="mt-1 h-[16.5px]" />
      )}
    </div>
  );
}

function CashCounter({ cents, onAdd }: { cents: number; onAdd: (deltaCents: number) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const color = "#ffb347";
  const add = (dollars: number) => {
    if (!dollars) return;
    onAdd(Math.round(dollars * 100));
    setOpen(false);
    setCustom("");
  };
  return (
    <div className="relative flex min-w-0 flex-col items-center rounded-2xl border border-white/[0.06] bg-black/20 px-1 pb-1.5 pt-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-2">Cash</span>
      <FlipNumber value={money(cents)} className="my-0.5 max-w-full font-mono text-xl font-bold leading-8" />
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.82 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
        aria-label="Add cash collected"
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-center rounded-xl text-xl font-bold"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color, boxShadow: `inset 0 0 0 1px ${color}44` }}
      >
        +
      </motion.button>
      <span className="mt-1 h-[16.5px]" />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 z-20 mb-2 w-48 rounded-2xl border border-white/10 bg-[#15151c] p-2 shadow-xl"
          >
            <div className="grid grid-cols-3 gap-1">
              {[100, 500, 1000].map((d) => (
                <button key={d} onClick={() => add(d)} className="rounded-lg bg-white/5 py-2 text-xs font-semibold text-[#ffb347] hover:bg-white/10">
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
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs outline-none"
              />
              <button className="rounded-lg bg-[#ffb347]/20 px-2 text-xs font-semibold text-[#ffb347]">Add</button>
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
    <div className="mt-4 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-black/20 p-3">
      <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="cashRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffb347" />
            <stop offset="100%" stopColor="#ff4fd8" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="url(#cashRing)"
          strokeWidth="9"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: Math.max(pct, 0.001), opacity: pct > 0 ? 1 : 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 ${full ? 10 : 4}px ${full ? "#ff4fd8" : "rgba(255,179,71,0.6)"})` }}
        />
      </svg>
      <div className="min-w-0">
        <div className="font-mono text-2xl font-bold tabular-nums" style={{ textShadow: "0 0 18px rgba(255,179,71,0.4)" }}>
          {Math.round(pct * 100)}%
        </div>
        <p className="text-sm">
          <span className="font-semibold">{money(goal.collectedCents)}</span> <span className="text-muted">of {money(goal.targetCents)} by {deadline}</span>
        </p>
        <p className="text-[11px] text-muted-2">
          {goal.daysLeft} days left · {goal.label.toLowerCase()}
        </p>
      </div>
    </div>
  );
}
