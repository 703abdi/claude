"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@/lib/types";
import type { RailView } from "./railView";

type StaticCommand = { id: string; label: string; run: () => void };
type Item = { kind: "command"; command: StaticCommand } | { kind: "task"; task: Task };

export default function CommandPalette({
  open,
  onClose,
  tasks,
  onSelectTask,
  onSetRailView,
  onNewTask,
  onManageCategories,
}: {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onSetRailView: (view: RailView) => void;
  onNewTask: () => void;
  onManageCategories: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const staticCommands: StaticCommand[] = useMemo(
    () => [
      { id: "go-focus", label: "Go to Focus", run: () => onSetRailView("FOCUS") },
      { id: "go-upcoming", label: "Go to Upcoming", run: () => onSetRailView("UPCOMING") },
      { id: "go-waiting", label: "Go to Waiting on others", run: () => onSetRailView("WAITING") },
      { id: "go-someday", label: "Go to Someday", run: () => onSetRailView("SOMEDAY") },
      { id: "go-done", label: "Go to Done", run: () => onSetRailView("DONE") },
      { id: "go-auto-cleared", label: "Go to Auto-cleared", run: () => onSetRailView("AUTO_CLEARED") },
      { id: "new-task", label: "New task", run: onNewTask },
      { id: "manage-categories", label: "Manage areas", run: onManageCategories },
    ],
    [onSetRailView, onNewTask, onManageCategories]
  );

  const q = query.trim().toLowerCase();
  const matchedCommands = q ? staticCommands.filter((c) => c.label.toLowerCase().includes(q)) : staticCommands;
  const matchedTasks = (q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks).slice(0, 8);

  const items: Item[] = [
    ...matchedCommands.map((c): Item => ({ kind: "command", command: c })),
    ...matchedTasks.map((t): Item => ({ kind: "task", task: t })),
  ];

  function runItem(item: Item) {
    if (item.kind === "command") item.command.run();
    else onSelectTask(item.task);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[activeIndex]) runItem(items[activeIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div className="fixed inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg border border-border bg-surface rounded shadow-xl animate-slide-up overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Jump to a task or command..."
          className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-border"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && <p className="px-4 py-3 text-sm text-muted-2">No matches.</p>}
          {items.map((item, i) => (
            <button
              key={item.kind === "command" ? item.command.id : item.task.id}
              onClick={() => runItem(item)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                i === activeIndex ? "bg-surface-hover text-foreground" : "text-muted"
              }`}
            >
              {item.kind === "command" ? (
                <span className="font-mono text-[9px] uppercase tracking-wide text-muted-2 shrink-0 w-8">cmd</span>
              ) : (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.task.category?.color || "var(--border)" }}
                />
              )}
              <span className="truncate">{item.kind === "command" ? item.command.label : item.task.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
