"use client";

import { useState } from "react";
import type { Category, Task } from "@/lib/types";
import type { Filters } from "./FilterBar";

const VIEWS = ["ALL", "TODAY", "NOW", "NEXT", "LATER"] as const;
const VIEW_LABEL: Record<(typeof VIEWS)[number], string> = {
  ALL: "All",
  TODAY: "Today",
  NOW: "Now",
  NEXT: "Next",
  LATER: "Later",
};

export default function LeftRail({
  tasks,
  categories,
  filters,
  onChange,
  onManageCategories,
}: {
  tasks: Task[];
  categories: Category[];
  filters: Filters;
  onChange: (f: Filters) => void;
  onManageCategories: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });

  const viewCounts: Record<(typeof VIEWS)[number], number> = {
    ALL: tasks.length,
    TODAY: tasks.filter((t) => t.bucket === "TODAY").length,
    NOW: tasks.filter((t) => t.bucket === "NOW").length,
    NEXT: tasks.filter((t) => t.bucket === "NEXT").length,
    LATER: tasks.filter((t) => t.bucket === "LATER").length,
  };
  const overdueCount = tasks.filter((t) => t.overdue).length;
  const waitingCount = tasks.filter((t) => t.status === "WAITING").length;
  const categoryCounts = new Map(
    categories.map((c) => [c.id, tasks.filter((t) => t.category?.id === c.id).length])
  );

  function selectView(v: (typeof VIEWS)[number]) {
    onChange({ ...filters, bucket: v });
  }

  if (collapsed) {
    return (
      <div className="hidden lg:flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3 sticky top-14 h-[calc(100vh-3.5rem-2rem)]">
        <button
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 flex items-center justify-center rounded text-muted-2 hover:text-foreground hover:bg-surface-hover"
          title="Expand sidebar"
        >
          <ChevronIcon className="w-3.5 h-3.5 rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div className="hidden lg:flex w-[220px] shrink-0 flex-col border-r border-border sticky top-14 h-[calc(100vh-3.5rem-2rem)] overflow-y-auto">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-2">Views</span>
        <button
          onClick={() => setCollapsed(true)}
          className="w-5 h-5 flex items-center justify-center rounded text-muted-2 hover:text-foreground"
          title="Collapse sidebar"
        >
          <ChevronIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <nav className="px-2 pb-3">
        {VIEWS.map((v) => (
          <RailRow
            key={v}
            active={filters.bucket === v}
            label={VIEW_LABEL[v]}
            count={viewCounts[v]}
            onClick={() => selectView(v)}
          />
        ))}
      </nav>

      <div className="px-3 pt-2 pb-1 border-t border-border">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-2">Filters</span>
      </div>
      <nav className="px-2 pb-3">
        <RailRow
          active={filters.overdueOnly}
          label="Overdue"
          count={overdueCount}
          countClassName={overdueCount > 0 ? "text-overdue" : undefined}
          onClick={() => set("overdueOnly", !filters.overdueOnly)}
        />
        <RailRow
          active={filters.waitingOnly}
          label="Waiting"
          count={waitingCount}
          onClick={() => set("waitingOnly", !filters.waitingOnly)}
        />
      </nav>

      <div className="flex items-center justify-between px-3 pt-2 pb-1 border-t border-border">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-2">Categories</span>
        <button onClick={onManageCategories} className="text-muted-2 hover:text-foreground" title="Manage categories">
          <EditIcon className="w-3 h-3" />
        </button>
      </div>
      <nav className="px-2 pb-3 flex-1">
        {categories.map((c) => (
          <RailRow
            key={c.id}
            active={filters.categoryId === c.id}
            label={c.name}
            count={categoryCounts.get(c.id) ?? 0}
            dotColor={c.color}
            onClick={() => set("categoryId", filters.categoryId === c.id ? "" : c.id)}
          />
        ))}
        {categories.length === 0 && (
          <p className="px-2.5 py-2 text-[11px] text-muted-2">No categories yet.</p>
        )}
      </nav>
    </div>
  );
}

function RailRow({
  active,
  label,
  count,
  dotColor,
  countClassName,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  dotColor?: string;
  countClassName?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[13px] transition-colors ${
        active ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground hover:bg-surface-hover/60"
      }`}
    >
      {dotColor ? (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
      ) : (
        <span className={`w-1 h-3 shrink-0 rounded-sm ${active ? "bg-accent" : "bg-transparent"}`} />
      )}
      <span className="flex-1 min-w-0 truncate text-left">{label}</span>
      <span className={`font-mono text-[11px] text-muted-2 ${countClassName ?? ""}`}>{count}</span>
    </button>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M11.5 2.5l2 2L5 13l-2.7.7.7-2.7 8.5-8.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
