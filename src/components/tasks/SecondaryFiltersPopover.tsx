"use client";

import { useEffect, useRef, useState } from "react";
import type { Filters } from "./FilterBar";

export default function SecondaryFiltersPopover({
  filters,
  onChange,
  people,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  people: { id: string; name: string }[];
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeCount = [filters.effort, filters.status, filters.personId].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[12px] font-medium transition-colors ${
          activeCount > 0 ? "border-accent/30 text-accent" : "border-border text-muted-2 hover:text-muted"
        }`}
      >
        <FilterIcon className="w-3 h-3" />
        {activeCount > 0 ? `${activeCount} filter${activeCount > 1 ? "s" : ""}` : "Filter"}
      </button>

      {open && (
        <div className="absolute z-30 top-full right-0 mt-2 w-64 rounded border border-border bg-surface shadow-xl p-3 space-y-3 animate-fade-in">
          <Field label="Effort">
            <select
              value={filters.effort}
              onChange={(e) => set("effort", e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm outline-none"
            >
              <option value="">Any</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              value={filters.status}
              onChange={(e) => set("status", e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm outline-none"
            >
              <option value="">Any</option>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="WAITING">Waiting</option>
            </select>
          </Field>
          <Field label="Person">
            <select
              value={filters.personId}
              onChange={(e) => set("personId", e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm outline-none"
            >
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {activeCount > 0 && (
            <button
              onClick={() => onChange({ ...filters, effort: "", status: "", personId: "" })}
              className="w-full text-center text-xs text-muted-2 hover:text-foreground pt-1 border-t border-border"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
