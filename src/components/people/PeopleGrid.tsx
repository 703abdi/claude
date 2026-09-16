"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";

type PersonSummary = {
  id: string;
  name: string;
  notes: string | null;
  isSeed?: boolean;
  activeCount: number;
  waitingCount: number;
  completedCount: number;
  upcomingCount: number;
};

export default function PeopleGrid({ initialPeople }: { initialPeople: PersonSummary[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const person = await api.people.create({ name: name.trim() });
    setPeople((prev) =>
      [...prev, { ...person, activeCount: 0, waitingCount: 0, completedCount: 0, upcomingCount: 0 }].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setName("");
    setAdding(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold tracking-tight">People</h1>
      </div>
      <p className="text-sm text-muted mb-6">Everyone tied to a task, a follow-up, or a meeting.</p>

      {adding ? (
        <form onSubmit={addPerson} className="flex items-center gap-2 mb-6">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            placeholder="Name"
            className="flex-1 bg-surface-2 border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-muted-2"
          />
          <button type="submit" className="text-xs font-semibold bg-foreground text-background rounded-md px-3 py-2">
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-muted px-2">
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-left border border-dashed border-border rounded-lg px-3 py-2.5 text-sm text-muted hover:text-foreground hover:border-muted-2 transition-colors mb-6"
        >
          + New person
        </button>
      )}

      {people.length === 0 ? (
        <p className="text-sm text-muted-2 py-6 text-center">Nobody yet — add someone tied to a task.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/people/${p.id}`}
              className="border border-border bg-surface rounded-lg p-4 hover:border-muted-2 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[15px]">{p.name}</span>
                {p.waitingCount > 0 && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "var(--status-yellow)" }} />
                )}
              </div>
              {p.notes && <p className="text-xs text-muted mt-1 line-clamp-1">{p.notes}</p>}
              <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                <span>
                  <strong className="text-foreground">{p.activeCount}</strong> active
                </span>
                <span>
                  <strong className="text-foreground">{p.waitingCount}</strong> waiting
                </span>
                <span>
                  <strong className="text-foreground">{p.completedCount}</strong> done
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
