"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { PersonSummary } from "@/lib/people-data";
import PeopleList from "./PeopleList";

/** List on the left, one person on the right. On a phone it's one or the other. */
export default function PeopleShell({ people, children }: { people: PersonSummary[]; children: ReactNode }) {
  const onPerson = usePathname().startsWith("/people/");
  return (
    <div className="md:grid md:h-screen md:grid-cols-[320px_1fr]">
      <aside className={`${onPerson ? "hidden md:block" : "block"} min-h-0 md:border-r md:border-border`}>
        <PeopleList key={people.map((p) => p.id + p.name).join("|")} initialPeople={people} />
      </aside>
      <section className={`${onPerson ? "block" : "hidden md:block"} min-h-0 md:overflow-y-auto`}>{children}</section>
    </div>
  );
}
