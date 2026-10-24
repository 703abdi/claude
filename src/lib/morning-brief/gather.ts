import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";
import { isOverdue } from "@/lib/task-logic";
import { retrieveRelevantContext } from "@/lib/context/retrieve";

const ABANDONED_DAYS = 5;

export async function gatherMorningBriefContext() {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const abandonedCutoff = new Date(now.getTime() - ABANDONED_DAYS * 24 * 60 * 60 * 1000);

  const [activeTasks, upcomingEvents, pendingSuggestions] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: TaskStatus.COMPLETED } },
      include: {
        category: true,
        people: { include: { person: true } },
        followUpPerson: true,
        blockedBy: { include: { blocker: { select: { status: true } } } },
      },
      orderBy: { position: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: now, lte: in48h } },
      include: { category: true, person: true },
      orderBy: { date: "asc" },
    }),
    prisma.suggestion.findMany({
      where: { status: "PENDING", confidence: { gte: 0.6 } },
      orderBy: { confidence: "desc" },
      take: 5,
    }),
  ]);

  const overdue = activeTasks.filter((t) => isOverdue(t.dueDate, t.status));
  const pinnedToday = activeTasks.filter((t) => t.pinnedToday);
  const waiting = activeTasks.filter((t) => t.status === TaskStatus.WAITING);
  const blocked = activeTasks.filter((t) => t.blockedBy.some((d) => d.blocker.status !== TaskStatus.COMPLETED));
  const abandoned = activeTasks.filter(
    (t) => t.status === TaskStatus.IN_PROGRESS && t.updatedAt < abandonedCutoff
  );

  const peopleWaitingOn = new Map<string, string>();
  for (const t of waiting) {
    for (const tp of t.people) peopleWaitingOn.set(tp.person.id, tp.person.name);
    if (t.followUpPerson) peopleWaitingOn.set(t.followUpPerson.id, t.followUpPerson.name);
  }

  // Everything the connectors have ingested used to be invisible here: this
  // gathered only tasks, events and suggestions, so the brief could never
  // mention a commitment from a note unless it happened to spawn a suggestion
  // at ingest time. Retrieval is deterministic, so this stays useful with no
  // ANTHROPIC_API_KEY configured.
  const context = await retrieveRelevantContext({
    activePeopleNames: [...peopleWaitingOn.values()],
    activeTaskTitles: activeTasks.map((t) => t.title),
    limit: 8,
    now,
  });

  return {
    overdue,
    pinnedToday,
    waiting,
    blocked,
    abandoned,
    upcomingEvents,
    pendingSuggestions,
    peopleWaitingOn: [...peopleWaitingOn.values()],
    totalActive: activeTasks.length,
    context,
  };
}

export type MorningBriefContext = Awaited<ReturnType<typeof gatherMorningBriefContext>>;
