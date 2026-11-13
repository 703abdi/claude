import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fmtClock } from "@/lib/jarvis/briefing";
import PersonNotes from "@/components/people/PersonNotes";

export const dynamic = "force-dynamic";

function day(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) notFound();

  const [tasks, events] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: TaskStatus.COMPLETED }, OR: [{ people: { some: { personId: id } } }, { followUpPersonId: id }] },
      select: { id: true, title: true, status: true, dueDate: true },
      orderBy: { position: "asc" },
    }),
    prisma.calendarEvent.findMany({ where: { personId: id }, orderBy: { date: "asc" } }),
  ]);

  const now = new Date();
  const upcoming = events.filter((e) => e.date >= now);
  const past = events.filter((e) => e.date < now).reverse().slice(0, 12);
  const owesYou = tasks.filter((t) => t.status === TaskStatus.WAITING);
  const yours = tasks.filter((t) => t.status !== TaskStatus.WAITING);

  return (
    <div className="mx-auto max-w-[760px] px-4 py-5 md:px-10 md:py-8">
      <Link href="/people" className="mb-4 inline-block text-[13px] text-muted hover:text-foreground md:hidden">
        ‹ People
      </Link>

      <PersonNotes key={person.id} person={{ id: person.id, name: person.name, notes: person.notes }} />

      <div className="mt-9 space-y-9">
        {upcoming.length > 0 && (
          <section className="jarvis-panel">
            <h2 className="mb-1 px-1 eyebrow">Coming up</h2>
            <ul>
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link href={`/calendar?day=${e.date.toISOString().slice(0, 10)}`} className="jarvis-row">
                    <span className="w-[104px] shrink-0 font-mono text-[12px] text-muted">{day(e.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{e.title}</span>
                    {e.startTime && !e.allDay && <span className="shrink-0 font-mono text-[12px] text-muted-2">{fmtClock(e.startTime)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(owesYou.length > 0 || yours.length > 0) && (
          <section className="jarvis-panel">
            <h2 className="mb-1 px-1 eyebrow">Open between you</h2>
            <ul>
              {[...owesYou, ...yours].map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks?highlight=${t.id}`} className="jarvis-row">
                    <span className={`w-[104px] shrink-0 font-mono text-[12px] ${t.status === TaskStatus.WAITING ? "text-accent" : "text-muted"}`}>
                      {t.status === TaskStatus.WAITING ? "They owe you" : "You owe"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t.title}</span>
                    {t.dueDate && <span className="shrink-0 font-mono text-[12px] text-muted-2">{day(t.dueDate)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="jarvis-panel">
          <h2 className="mb-1 px-1 eyebrow">Past meetings</h2>
          {past.length === 0 ? (
            <p className="border-t border-border px-1 py-3 text-[14px] text-muted-2">None yet. Meetings show here once they are on the calendar with {person.name.split(" ")[0]}.</p>
          ) : (
            <ul>
              {past.map((e) => (
                <li key={e.id} className="jarvis-row">
                  <span className="w-[104px] shrink-0 font-mono text-[12px] text-muted">{day(e.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{e.title}</span>
                  {e.recordingUrl && (
                    <a href={e.recordingUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[12px] text-accent hover:underline">
                      Recording
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
