"use client";

import { useState } from "react";
import type { Category } from "@/lib/types";
import { api } from "@/lib/api-client";

const SWATCHES = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#64748b",
];

export default function CategoryManager({
  categories,
  onChange,
  onClose,
}: {
  categories: Category[];
  onChange: (categories: Category[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setError(null);
    try {
      const cat = await api.categories.create({ name: name.trim(), color });
      onChange([...categories, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } catch {
      setError("A category with this name already exists.");
    }
  }

  async function rename(id: string, newName: string) {
    const cat = await api.categories.update(id, { name: newName });
    onChange(categories.map((c) => (c.id === id ? cat : c)));
  }

  async function recolor(id: string, newColor: string) {
    const cat = await api.categories.update(id, { color: newColor });
    onChange(categories.map((c) => (c.id === id ? cat : c)));
  }

  async function remove(id: string) {
    if (!confirm("Delete this category? Tasks keep their other fields but lose this category.")) return;
    await api.categories.delete(id);
    onChange(categories.filter((c) => c.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface border border-border rounded-lg p-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">Categories</h3>
          <button onClick={onClose} className="text-muted-2 hover:text-foreground text-sm">
            ✕
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <select
                value={c.color}
                onChange={(e) => recolor(c.id, e.target.value)}
                className="w-6 h-6 rounded-full border-0 p-0 shrink-0"
                style={{ backgroundColor: c.color, appearance: "none" as const }}
              >
                {SWATCHES.map((s) => (
                  <option key={s} value={s} style={{ backgroundColor: s }}>
                    {" "}
                  </option>
                ))}
              </select>
              <input
                defaultValue={c.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && rename(c.id, e.target.value.trim())}
                className="flex-1 bg-surface-2 border border-border rounded-md px-2 py-1 text-sm outline-none"
              />
              <button onClick={() => remove(c.id)} className="text-muted-2 hover:text-status-red text-xs px-1">
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-6 h-6 rounded-full border-0 p-0 shrink-0"
            style={{ backgroundColor: color, appearance: "none" as const }}
          >
            {SWATCHES.map((s) => (
              <option key={s} value={s} style={{ backgroundColor: s }}>
                {" "}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New category name"
            className="flex-1 bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
          />
          <button onClick={create} className="text-xs font-semibold bg-foreground text-background rounded-md px-2.5 py-1.5">
            Add
          </button>
        </div>
        {error && <p className="text-xs text-status-red mt-2">{error}</p>}
      </div>
    </div>
  );
}
