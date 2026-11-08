"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Category } from "@/lib/types";
import { formatClock, parseQuickAdd, type ParsedQuickAdd, type PersonLite } from "@/lib/quick-add-parse";
import { Chip } from "./hub-ui";

const EFFORT_COLOR = { LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#ef4444" } as const;

export function ParseChips({ parsed, showPin = true }: { parsed: ParsedQuickAdd; showPin?: boolean }) {
  const chips: { key: string; node: React.ReactNode }[] = [];
  if (parsed.category) chips.push({ key: "cat", node: <Chip color={parsed.category.color}>#{parsed.category.name}</Chip> });
  if (parsed.unknownCategory) chips.push({ key: "cat?", node: <Chip color="#6f6f7e">#{parsed.unknownCategory}?</Chip> });
  for (const p of parsed.people) chips.push({ key: `p-${p.id}`, node: <Chip color="#22e1ff">@{p.name}</Chip> });
  for (const u of parsed.unknownPeople) chips.push({ key: `u-${u}`, node: <Chip color="#6f6f7e" title="No one by that name in People">@{u}?</Chip> });
  if (parsed.dueLabel) chips.push({ key: "due", node: <Chip color="#ffb347">{parsed.dueLabel}</Chip> });
  if (parsed.dueTime) chips.push({ key: "time", node: <Chip color="#ffb347">{formatClock(parsed.dueTime)}</Chip> });
  if (parsed.effort) chips.push({ key: "eff", node: <Chip color={EFFORT_COLOR[parsed.effort]}>{parsed.effort.toLowerCase()}</Chip> });
  if (showPin && parsed.pinToday) chips.push({ key: "pin", node: <Chip color="#9b7bff">pinned today</Chip> });

  return (
    <div className="flex min-h-[22px] flex-wrap items-center gap-1.5">
      <AnimatePresence initial={false}>
        {chips.map((c) => (
          <motion.span
            key={c.key}
            layout
            initial={{ opacity: 0, scale: 0.85, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.16 }}
          >
            {c.node}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function HubQuickAdd({
  categories,
  people,
  onSubmit,
}: {
  categories: Category[];
  people: PersonLite[];
  onSubmit: (parsed: ParsedQuickAdd) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus on desktop only (on a phone it would pop the keyboard on every visit).
  useEffect(() => {
    if (window.matchMedia("(min-width: 769px) and (pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const parsed = useMemo(() => (value.trim() ? parseQuickAdd(value, { categories, people }) : null), [value, categories, people]);

  async function submit() {
    if (!parsed?.title) return;
    const snapshot = value;
    setValue("");
    setError(null);
    inputRef.current?.focus();
    try {
      await onSubmit(parsed);
    } catch {
      setValue(snapshot);
      setError("Couldn't save that. It's back in the box, try again.");
    }
  }

  return (
    <div
      style={{ background: "linear-gradient(180deg, rgba(26,26,34,0.96), rgba(19,19,25,0.96))" }}
      className="relative rounded-2xl glass px-4 pb-2.5 pt-3 focus-within:shadow-[0_0_0_1px_rgba(34,225,255,0.45),0_0_28px_-8px_rgba(34,225,255,0.6)] transition-shadow">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#22e1ff]/10 text-[#22e1ff]">
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          enterKeyHint="done"
          aria-label="Quick add a task"
          placeholder="Add to today: call Joaquin 2pm"
          className="min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-muted-2"
        />
        <span className="hidden shrink-0 font-mono text-[10px] text-muted-2 md:inline">ENTER</span>
      </div>
      <div className="mt-1.5 pl-9">
        {parsed ? (
          <ParseChips parsed={{ ...parsed, pinToday: parsed.pinToday || !parsed.dueDate }} />
        ) : (
          <p className="min-h-[22px] text-[11px] leading-[22px] text-muted-2">#area @person !high tomorrow 3pm &gt;today</p>
        )}
      </div>
      {error && <p className="mt-1 pl-9 text-xs text-overdue">{error}</p>}
    </div>
  );
}
