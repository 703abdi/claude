"use client";

import { useEffect, useState } from "react";
import PeopleGrid, { type PersonSummary } from "@/components/people/PeopleGrid";

/** Everyone you work with, embedded in the Hub. Re-fetches when the hub's version changes. */
export default function HubPeople({ version }: { version: string }) {
  const [people, setPeople] = useState<PersonSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/people", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((p: PersonSummary[]) => alive && setPeople(p))
      .catch(() => alive && setPeople([]));
    return () => {
      alive = false;
    };
  }, [version]);

  if (people === null) {
    return (
      <div className="card p-5">
        <div className="mb-4 h-3 w-24 animate-pulse rounded-full bg-surface-hover" />
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mx-auto h-16 w-16 animate-pulse rounded-full bg-surface-hover" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <PeopleGrid key={version} initialPeople={people} embedded />
    </div>
  );
}
