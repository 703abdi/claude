"use client";

import { useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/types";

export type Filters = {
  bucket: "ALL" | "TODAY" | "NOW" | "NEXT" | "LATER";
  categoryId: string;
  effort: string;
  status: string;
  personId: string;
  overdueOnly: boolean;
  waitingOnly: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  bucket: "ALL",
  categoryId: "",
  effort: "",
  status: "",
  personId: "",
  overdueOnly: false,
  waitingOnly: false,
};

const BUCKETS = ["ALL", "TODAY", "NOW", "NEXT", "LATER"] as const;
const BUCKET_LABEL: Record<(typeof BUCKETS)[number], string> = {
  ALL: "All",
  TODAY: "Today",
  NOW: "Now",
  NEXT: "Next",
  LATER: "Later",
};

function countActiveFilters(f: Filters) {
  let n = 0;
  if (f.categoryId) n++;
  if (f.effort) n++;
  if (f.status) n++;
  if (f.personId) n++;
  if (f.overdueOnly) n++;
  if (f.waitingOnly) n++;
  return n;
}

export default function FilterBar({
  filters,
  onChange,
  categories,
  people,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  categories: Category[];
  people: { id: string; name: string }[];
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  const activeCount = countActiveFilters(filters);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const categoryName = categories.find((c) => c.id === filters.categoryId)?.name;
  const personName = people.find((p) => p.id === filters.personId)?.name;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Segmented view switcher */}
        <div className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-surface-2 border border-border">
          {BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => set("bucket", b)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.bucket === b
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {BUCKET_LABEL[b]}
            </button>
          ))}
        </div>

        {/* Filters popover trigger */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              activeCount > 0
                ? "border-foreground/30 bg-surface-2 text-foreground"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            <FilterIcon className="w-3.5 h-3.5" />
            Filters
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-foreground text-background text-[10px] font-bold">
                {activeCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute z-30 top-full left-0 mt-2 w-72 rounded-lg border border-border bg-surface shadow-xl p-3 space-y-3 animate-fade-in">
              <FilterField label="Category">
                <select
                  value={filters.categoryId}
                  onChange={(e) => set("categoryId", e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-muted-2"
                >
                  <option value="">Any category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Effort">
                <select
                  value={filters.effort}
                  onChange={(e) => set("effort", e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-muted-2"
                >
                  <option value="">Any effort</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </FilterField>

              <FilterField label="Status">
                <select
                  value={filters.status}
                  onChange={(e) => set("status", e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-muted-2"
                >
                  <option value="">Any status</option>
                  <option value="NOT_STARTED">Not started</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="WAITING">Waiting</option>
                </select>
              </FilterField>

              <FilterField label="Person">
                <select
                  value={filters.personId}
                  onChange={(e) => set("personId", e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-muted-2"
                >
                  <option value="">Anyone</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </FilterField>

              <div className="flex items-center gap-2 pt-1">
                <ToggleChip
                  active={filters.overdueOnly}
                  activeClass="bg-status-red/15 border-status-red text-status-red"
                  onClick={() => set("overdueOnly", !filters.overdueOnly)}
                >
                  Overdue
                </ToggleChip>
                <ToggleChip
                  active={filters.waitingOnly}
                  activeClass="bg-status-yellow/15 border-status-yellow text-status-yellow"
                  onClick={() => set("waitingOnly", !filters.waitingOnly)}
                >
                  Waiting
                </ToggleChip>
              </div>

              {activeCount > 0 && (
                <button
                  onClick={() => onChange({ ...DEFAULT_FILTERS, bucket: filters.bucket })}
                  className="w-full text-center text-xs text-muted-2 hover:text-foreground pt-1 border-t border-border"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Applied filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {categoryName && <AppliedChip onRemove={() => set("categoryId", "")}>{categoryName}</AppliedChip>}
          {filters.effort && (
            <AppliedChip onRemove={() => set("effort", "")}>
              {filters.effort[0] + filters.effort.slice(1).toLowerCase()} effort
            </AppliedChip>
          )}
          {filters.status && (
            <AppliedChip onRemove={() => set("status", "")}>
              {filters.status.replace("_", " ").toLowerCase()}
            </AppliedChip>
          )}
          {personName && <AppliedChip onRemove={() => set("personId", "")}>{personName}</AppliedChip>}
          {filters.overdueOnly && <AppliedChip onRemove={() => set("overdueOnly", false)}>Overdue</AppliedChip>}
          {filters.waitingOnly && <AppliedChip onRemove={() => set("waitingOnly", false)}>Waiting</AppliedChip>}
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

function ToggleChip({
  active,
  activeClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active ? activeClass : "border-border text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function AppliedChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs pl-2.5 pr-1.5 py-1 rounded-full bg-surface-2 border border-border text-foreground">
      {children}
      <button onClick={onRemove} className="text-muted-2 hover:text-foreground w-3.5 h-3.5 flex items-center justify-center">
        ✕
      </button>
    </span>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
