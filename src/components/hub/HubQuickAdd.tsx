"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Category } from "@/lib/types";
import { formatClock, parseQuickAdd, type ParsedQuickAdd, type PersonLite } from "@/lib/quick-add-parse";
import { Chip } from "./hub-ui";

export function ParseChips({ parsed, showPin = true }: { parsed: ParsedQuickAdd; showPin?: boolean }) {
  const chips: { key: string; node: React.ReactNode }[] = [];
  if (parsed.category) chips.push({ key: "cat", node: <Chip color={parsed.category.color}>#{parsed.category.name}</Chip> });
  if (parsed.unknownCategory) chips.push({ key: "cat?", node: <Chip title="No category by that name">#{parsed.unknownCategory}?</Chip> });
  for (const p of parsed.people) chips.push({ key: `p-${p.id}`, node: <Chip>@{p.name}</Chip> });
  for (const u of parsed.unknownPeople) chips.push({ key: `u-${u}`, node: <Chip title="No one by that name in People">@{u}?</Chip> });
  if (parsed.dueLabel) chips.push({ key: "due", node: <Chip tone="gold">{parsed.dueLabel}</Chip> });
  if (parsed.dueTime) chips.push({ key: "time", node: <Chip tone="gold">{formatClock(parsed.dueTime)}</Chip> });
  if (parsed.effort) chips.push({ key: "eff", node: <Chip>{parsed.effort.toLowerCase()} effort</Chip> });
  if (showPin && parsed.pinToday) chips.push({ key: "pin", node: <Chip tone="gold">pinned today</Chip> });

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
    <div className="-mx-1 bg-background px-1 pb-2 pt-1">
      <div className="flex h-14 items-center gap-3 rounded-2xl border border-border-2 bg-surface-2 px-4 transition-shadow focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-background">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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
          style={{ outline: "none" }}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground placeholder:text-muted-2"
        />
        <span className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-2 md:inline">ENTER</span>
      </div>
      <div className="mt-2 px-1">
        {parsed ? (
          <ParseChips parsed={{ ...parsed, pinToday: parsed.pinToday || !parsed.dueDate }} />
        ) : (
          <p className="min-h-[22px] font-mono text-[11px] leading-[22px] text-muted-2">#area @person !high tomorrow 3pm &gt;today</p>
        )}
      </div>
      {error && <p className="mt-1 px-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
