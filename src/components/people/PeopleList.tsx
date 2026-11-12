"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import Avatar from "@/components/shared/Avatar";
import { parseContacts } from "@/lib/contacts-import";
import type { PersonSummary } from "@/lib/people-data";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** What matters about someone in one line: they owe you, you're meeting them, or when you last did. */
function statusLine(p: PersonSummary) {
  if (p.waitingCount > 0) return { text: `Owes you ${p.waitingCount}`, hot: true };
  if (p.nextMeeting) return { text: `Meeting ${shortDate(p.nextMeeting)}`, hot: false };
  if (p.lastMeeting) return { text: `Last met ${shortDate(p.lastMeeting)}`, hot: false };
  return { text: p.notes?.split("\n")[0].slice(0, 40) || "No notes yet", hot: false };
}

function rank(p: PersonSummary) {
  if (p.waitingCount > 0) return 0;
  if (p.nextMeeting) return 1;
  return 2;
}

const blank = (person: { id: string; name: string; notes?: string | null }): PersonSummary => ({
  id: person.id,
  name: person.name,
  notes: person.notes ?? null,
  waitingCount: 0,
  nextMeeting: null,
  lastMeeting: null,
});

export default function PeopleList({ initialPeople }: { initialPeople: PersonSummary[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [people, setPeople] = useState(initialPeople);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeId = pathname.startsWith("/people/") ? pathname.split("/")[2] : null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.notes ?? "").toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || (a.nextMeeting ?? "").localeCompare(b.nextMeeting ?? "") || a.name.localeCompare(b.name));
  }, [people, query]);

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    try {
      const person = await api.people.create({ name: n });
      setPeople((prev) => [...prev, blank(person)]);
      setName("");
      router.push(`/people/${person.id}`);
    } catch {
      setStatus("That name is already here.");
      setTimeout(() => setStatus(null), 4000);
    }
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const contacts = parseContacts(await file.text(), file.name);
    if (contacts.length === 0) {
      setStatus("No names found in that file.");
      return;
    }
    const have = new Set(people.map((p) => p.name.toLowerCase()));
    const fresh = contacts.filter((c) => !have.has(c.name.toLowerCase()));
    setStatus(`Adding ${fresh.length} of ${contacts.length}...`);
    let added = 0;
    for (const c of fresh) {
      try {
        const person = await api.people.create({ name: c.name, notes: c.email });
        setPeople((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, blank(person)]));
        added++;
      } catch {
        /* skip the row, keep going */
      }
    }
    setStatus(`Added ${added}. ${contacts.length - fresh.length} already here.`);
    setTimeout(() => setStatus(null), 4000);
  }

  const input = "h-10 min-w-0 rounded-full border border-border bg-surface px-4 text-[14px] outline-none placeholder:text-muted-2 focus:border-accent";

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-5 md:px-5 md:pt-8">
        <p className="eyebrow">People</p>
        <div className="mt-1 flex items-baseline justify-between">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{people.length}</h1>
          <button onClick={() => fileRef.current?.click()} title="Upload a CSV or vCard export" className="text-[12px] text-muted-2 hover:text-foreground">
            Import contacts
          </button>
          <input ref={fileRef} type="file" accept=".csv,.vcf,text/csv,text/vcard" className="hidden" onChange={importFile} />
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search people" className={`${input} mt-3 w-full`} />
        <form onSubmit={addPerson} className="mt-2 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add someone" aria-label="Add a person by name" className={`${input} flex-1`} />
          <button type="submit" disabled={!name.trim()} className="h-10 shrink-0 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-25">
            Add
          </button>
        </form>
        {status && <p className="mt-2 text-[12px] text-muted">{status}</p>}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto border-t border-border">
        {shown.length === 0 && <li className="px-5 py-8 text-center text-[14px] text-muted-2">{people.length ? "Nobody matches." : "Nobody yet. Add someone above."}</li>}
        {shown.map((p) => {
          const s = statusLine(p);
          const active = p.id === activeId;
          return (
            <li key={p.id}>
              <Link
                href={`/people/${p.id}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 border-b border-border px-4 py-3 transition-colors md:px-5 ${active ? "bg-surface-hover" : "hover:bg-surface"}`}
              >
                <Avatar name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{p.name}</span>
                  <span className={`block truncate text-[12px] ${s.hot ? "text-accent" : "text-muted-2"}`}>{s.text}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
