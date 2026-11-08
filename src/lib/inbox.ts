import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { partsInTz, zonedTime } from "@/lib/day";
import { matchPeople } from "@/lib/quick-add-parse";

/** "2026-11-12" -> local noon that day; full ISO strings are used as-is. */
export function parseAgentDue(due: string, tz: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    const [y, m, d] = due.split("-").map(Number);
    return zonedTime(y, m, d, 12, 0, tz);
  }
  return new Date(due);
}

export async function findPersonByName(name: string | null | undefined) {
  if (!name?.trim()) return null;
  const people = await prisma.person.findMany({ select: { id: true, name: true } });
  const q = name.trim().toLowerCase();
  return people.find((p) => p.name.toLowerCase() === q) ?? matchPeople(q, people);
}

export async function createAgentTask(input: {
  agent: string;
  title: string;
  notes?: string | null;
  due?: Date | null;
  personId?: string | null;
  pinToday?: boolean;
  tz: string;
}) {
  const last = await prisma.task.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
  const dueTime = input.due && !Number.isNaN(input.due.getTime()) ? partsInTz(input.due, input.tz) : null;
  const hasClock = dueTime && !(dueTime.h === 12 && dueTime.mi === 0);
  const task = await prisma.task.create({
    data: {
      title: input.title,
      notes: input.notes ?? null,
      dueDate: input.due && !Number.isNaN(input.due.getTime()) ? input.due : null,
      dueTime: hasClock ? `${String(dueTime.h).padStart(2, "0")}:${String(dueTime.mi).padStart(2, "0")}` : null,
      pinnedToday: input.pinToday ?? true,
      source: `agent:${input.agent}`,
      position: (last?.position ?? 0) + 1000,
      people: input.personId ? { create: [{ personId: input.personId }] } : undefined,
    },
    include: taskInclude,
  });
  await prisma.taskEvent.create({
    data: { taskId: task.id, type: "created", toValue: task.status, actor: `agent:${input.agent}` },
  });
  return serializeTask(task);
}
