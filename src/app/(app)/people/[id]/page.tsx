import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import StatusDot from "@/components/shared/StatusDot";
import EffortBars from "@/components/shared/EffortBars";
import PersonHeader from "@/components/people/PersonHeader";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) notFound();

  const [linkedTasks, events, contextItems] = await Promise.all([
    prisma.task.findMany({
      where: { OR: [{ people: { some: { personId: id } } }, { followUpPersonId: id }] },
      include: taskInclude,
      orderBy: { position: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: { personId: id },
      orderBy: { date: "asc" },
      include: { category: true, task: { select: { id: true, title: true, status: true } } },
    }),
    prisma.contextItem.findMany({ where: { personId: id }, orderBy: { timestamp: "desc" }, take: 10 }),
  ]);

  const tasks = linkedTasks.map(serializeTask);
  const active = tasks.filter((t) => t.status !== "COMPLETED");
  const waiting = tasks.filter((t) => t.status === "WAITING");
  const completed = tasks.filter((t) => t.status === "COMPLETED");
  const upcoming = tasks.filter((t) => t.dueDate && t.status !== "COMPLETED");

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
      <Link href="/people" className="text-xs text-muted hover:text-foreground">
        ← People
      </Link>

      <PersonHeader person={{ id: person.id, name: person.name, notes: person.notes }} />

      {waiting.length > 0 && (
        <div className="mt-4 text-sm border border-status-yellow/40 bg-status-yellow/10 text-status-yellow rounded-lg px-3 py-2.5">
          {waiting.length} unresolved {waiting.length === 1 ? "task" : "tasks"} involving {person.name} —{" "}
          {waiting.map((t) => t.title).join(", ")}.
        </div>
      )}

      <Section title="Active" tasks={active} emptyState={`Nothing active with ${person.name}.`} />
      <Section title="Waiting / follow-up" tasks={waiting} emptyState="Nothing waiting." />
      <Section title="Upcoming (dated)" tasks={upcoming} emptyState="Nothing scheduled." />
      <Section title="Completed" tasks={completed} emptyState="Nothing completed yet." collapsedByDefault />

      {events.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide mb-2.5">Calendar</h2>
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="border border-border bg-surface rounded-lg px-3 py-2.5 flex items-center gap-3">
                {e.category && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.category.color }} />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{e.title}</p>
                  <p className="text-xs text-muted">
                    {new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {e.startTime ? ` · ${e.startTime}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {contextItems.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide mb-2.5">Context</h2>
          <div className="space-y-2">
            {contextItems.map((c) => (
              <div key={c.id} className="border border-border bg-surface rounded-lg px-3 py-2.5">
                <p className="text-sm">{c.content}</p>
                <p className="text-xs text-muted-2 mt-1">
                  {c.contentType.toLowerCase().replace("_", " ")} · {c.source.toLowerCase()} ·{" "}
                  {new Date(c.timestamp).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Section({
  title,
  tasks,
  emptyState,
  collapsedByDefault,
}: {
  title: string;
  tasks: ReturnType<typeof serializeTask>[];
  emptyState: string;
  collapsedByDefault?: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide mb-2.5">
        {title} <span className="text-muted-2 font-normal">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-2">{emptyState}</p>
      ) : (
        <details open={!collapsedByDefault}>
          <summary className="sr-only">{title}</summary>
          <div className="space-y-2">
            {tasks.map((t) => (
              <Link
                key={t.id}
                href={`/tasks?highlight=${t.id}`}
                className="flex items-center gap-3 border border-border bg-surface rounded-lg px-3 py-2.5 hover:border-muted-2 transition-colors"
              >
                <StatusDot status={t.status} className="w-2.5 h-2.5 shrink-0" />
                <span className={`flex-1 min-w-0 text-sm font-semibold truncate ${t.status === "COMPLETED" ? "line-through text-muted" : ""}`}>
                  {t.title}
                </span>
                {t.dueDate && (
                  <span className={`text-xs shrink-0 ${t.overdue ? "text-status-red" : "text-muted"}`}>
                    {new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                )}
                <EffortBars effort={t.effort} className="shrink-0" />
              </Link>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
