"use client";

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
  const active = filters !== DEFAULT_FILTERS && JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-6">
      {(["ALL", "TODAY", "NOW", "NEXT", "LATER"] as const).map((b) => (
        <button
          key={b}
          onClick={() => set("bucket", b)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            filters.bucket === b ? "bg-foreground text-background border-foreground" : "border-border text-muted"
          }`}
        >
          {b === "ALL" ? "All" : b[0] + b.slice(1).toLowerCase()}
        </button>
      ))}

      <span className="w-px h-4 bg-border mx-1" />

      <select
        value={filters.categoryId}
        onChange={(e) => set("categoryId", e.target.value)}
        className="bg-surface-2 border border-border rounded-full px-2.5 py-1 text-xs outline-none"
      >
        <option value="">Category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        value={filters.effort}
        onChange={(e) => set("effort", e.target.value)}
        className="bg-surface-2 border border-border rounded-full px-2.5 py-1 text-xs outline-none"
      >
        <option value="">Effort</option>
        <option value="LOW">Low</option>
        <option value="MEDIUM">Medium</option>
        <option value="HIGH">High</option>
      </select>

      <select
        value={filters.status}
        onChange={(e) => set("status", e.target.value)}
        className="bg-surface-2 border border-border rounded-full px-2.5 py-1 text-xs outline-none"
      >
        <option value="">Status</option>
        <option value="NOT_STARTED">Not started</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="WAITING">Waiting</option>
      </select>

      <select
        value={filters.personId}
        onChange={(e) => set("personId", e.target.value)}
        className="bg-surface-2 border border-border rounded-full px-2.5 py-1 text-xs outline-none"
      >
        <option value="">Person</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <button
        onClick={() => set("overdueOnly", !filters.overdueOnly)}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
          filters.overdueOnly ? "bg-status-red/15 border-status-red text-status-red" : "border-border text-muted"
        }`}
      >
        Overdue
      </button>
      <button
        onClick={() => set("waitingOnly", !filters.waitingOnly)}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
          filters.waitingOnly
            ? "bg-status-yellow/15 border-status-yellow text-status-yellow"
            : "border-border text-muted"
        }`}
      >
        Waiting
      </button>

      {active && (
        <button onClick={() => onChange(DEFAULT_FILTERS)} className="text-xs text-muted-2 hover:text-foreground ml-1">
          Clear
        </button>
      )}
    </div>
  );
}
