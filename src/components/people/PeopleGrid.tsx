"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import Avatar from "@/components/shared/Avatar";

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
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted mt-1">Everyone tied to a task, a follow-up, or a meeting.</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 text-sm font-semibold bg-foreground text-background rounded-lg px-4 py-2 hover:opacity-90 transition-opacity"
          >
            + Add person
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={addPerson} className="flex items-center gap-2 mb-8 border border-border bg-surface rounded-lg p-3 animate-fade-in">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            placeholder="Their name"
            className="flex-1 bg-surface-2 border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-muted-2"
          />
          <button type="submit" className="text-sm font-semibold bg-foreground text-background rounded-md px-3.5 py-2">
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-sm text-muted px-2">
            Cancel
          </button>
        </form>
      )}

      {people.length === 0 ? (
        <p className="text-sm text-muted-2 py-12 text-center">Nobody yet — add someone tied to a task.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-7">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/people/${p.id}`}
              className="group flex flex-col items-center text-center gap-2.5"
            >
              <span className="relative">
                <Avatar
                  name={p.name}
                  size="xl"
                  className="ring-2 ring-transparent group-hover:ring-border transition-all group-active:scale-95"
                />
                {p.waitingCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background"
                    style={{ backgroundColor: "var(--status-yellow)" }}
                    title={`${p.waitingCount} waiting`}
                  />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate max-w-[7.5rem]">{p.name}</p>
                <p className="text-xs text-muted-2 mt-0.5">
                  {p.activeCount > 0 ? `${p.activeCount} active` : "Nothing active"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
