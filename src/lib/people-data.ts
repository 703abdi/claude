import { prisma } from "./prisma";
import { TaskStatus } from "@prisma/client";

export async function getPeopleWithCounts() {
  const people = await prisma.person.findMany({
    orderBy: { name: "asc" },
    include: {
      tasks: { include: { task: { select: { id: true, status: true, dueDate: true } } } },
      followUpTasks: { select: { id: true, status: true, followUpRequired: true } },
    },
  });

  return people.map((p) => {
    const linkedTasks = p.tasks.map((tp) => tp.task);
    const allTasksById = new Map([...linkedTasks, ...p.followUpTasks].map((t) => [t.id, t]));
    const allTasks = [...allTasksById.values()];
    const activeCount = allTasks.filter((t) => t.status !== TaskStatus.COMPLETED).length;
    const waitingCount = allTasks.filter((t) => t.status === TaskStatus.WAITING).length;
    const completedCount = allTasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const upcomingCount = linkedTasks.filter(
      (t) => t.dueDate && t.status !== TaskStatus.COMPLETED
    ).length;

    return {
      id: p.id,
      name: p.name,
      notes: p.notes,
      isSeed: p.isSeed,
      activeCount,
      waitingCount,
      completedCount,
      upcomingCount,
    };
  });
}
