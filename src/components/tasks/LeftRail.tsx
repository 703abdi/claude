"use client";

import { useState } from "react";
import type { Category } from "@/lib/types";
import type { RailView } from "./railView";

const VIEWS: RailView[] = ["FOCUS", "UPCOMING", "WAITING", "SOMEDAY", "DONE", "AUTO_CLEARED"];
const VIEW_LABEL: Record<RailView, string> = {
  FOCUS: "Focus",
  UPCOMING: "Upcoming",
  WAITING: "Waiting on others",
  SOMEDAY: "Someday",
  DONE: "Done",
  AUTO_CLEARED: "Auto-cleared",
};

export default function LeftRail({
  railView,
  onRailViewChange,
  counts,
  categories,
  categoryId,
  onCategoryChange,
  categoryCounts,
  onManageCategories,
}: {
  railView: RailView;
  onRailViewChange: (v: RailView) => void;
  counts: Record<RailView, number>;
  categories: Category[];
  categoryId: string;
  onCategoryChange: (id: string) => void;
  categoryCounts: Map<string, number>;
  onManageCategories: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="hidden lg:flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3 sticky top-14 h-[calc(100vh-3.5rem)]">
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
    <div className="hidden lg:flex w-[240px] shrink-0 flex-col border-r border-border sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="flex items-center justify-end px-3 pt-2">
        <button
          onClick={() => setCollapsed(true)}
          className="w-5 h-5 flex items-center justify-center rounded text-muted-2 hover:text-foreground"
          title="Collapse sidebar"
        >
          <ChevronIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <nav className="px-3 pt-1 pb-4 space-y-0.5">
        {VIEWS.map((v) => {
          const active = railView === v;
          return (
            <button
              key={v}
              onClick={() => onRailViewChange(v)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[14px] transition-colors ${
                active ? "text-foreground font-semibold" : "text-muted hover:text-foreground"
              }`}
            >
              <span>{VIEW_LABEL[v]}</span>
              <span
                className={`text-[12px] font-mono ${
                  active
                    ? "min-w-[22px] text-center px-1.5 py-0.5 rounded-full bg-accent text-white font-semibold"
                    : "text-muted-2"
                }`}
              >
                {counts[v]}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex items-center justify-between px-3 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">Areas</span>
        <button onClick={onManageCategories} className="text-muted-2 hover:text-foreground" title="Manage areas">
          <EditIcon className="w-3 h-3" />
        </button>
      </div>
      <nav className="px-3 pb-3 flex-1 space-y-1">
        {categories.map((c) => {
          const active = categoryId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onCategoryChange(active ? "" : c.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-opacity hover:opacity-80"
              style={{
                backgroundColor: `${c.color}${active ? "33" : "18"}`,
                color: active ? c.color : "var(--foreground)",
                outline: active ? `1px solid ${c.color}66` : undefined,
              }}
            >
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
              <span className="flex-1 min-w-0 truncate text-left">{c.name}</span>
              <span className="font-mono text-[11px] opacity-70">{categoryCounts.get(c.id) ?? 0}</span>
            </button>
          );
        })}
        <button
          onClick={onManageCategories}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] text-muted-2 hover:text-foreground"
        >
          + New area
        </button>
      </nav>
    </div>
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
