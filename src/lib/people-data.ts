import { prisma } from "./prisma";
import { TaskStatus } from "@prisma/client";

export type PersonSummary = {
  id: string;
  name: string;
  notes: string | null;
  /** Open things they owe Abdi. */
  waitingCount: number;
  /** ISO time of the next meeting with them, if any. */
  nextMeeting: string | null;
  /** ISO time of the most recent past meeting. */
  lastMeeting: string | null;
};

export async function getPeopleSummaries(): Promise<PersonSummary[]> {
  const now = new Date();
  const people = await prisma.person.findMany({
    orderBy: { name: "asc" },
    include: {
      tasks: { where: { task: { status: TaskStatus.WAITING } }, select: { taskId: true } },
      followUpTasks: { where: { status: TaskStatus.WAITING }, select: { id: true } },
      events: { select: { date: true }, orderBy: { date: "asc" } },
    },
  });
  return people.map((p) => {
    const waiting = new Set([...p.tasks.map((t) => t.taskId), ...p.followUpTasks.map((t) => t.id)]);
    const next = p.events.find((e) => e.date >= now);
    const past = p.events.filter((e) => e.date < now);
    return {
      id: p.id,
      name: p.name,
      notes: p.notes,
      waitingCount: waiting.size,
      nextMeeting: next?.date.toISOString() ?? null,
      lastMeeting: past.length ? past[past.length - 1].date.toISOString() : null,
    };
  });
}
