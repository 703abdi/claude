import { Prisma, TaskStatus } from "@prisma/client";
import { computeDateBucket, isOverdue } from "./task-logic";

const taskWithRelations = Prisma.validator<Prisma.TaskDefaultArgs>()({
  include: {
    category: true,
    steps: { orderBy: { position: "asc" } },
    people: { include: { person: true } },
    followUpPerson: true,
    blockedBy: { include: { blocker: { select: { id: true, title: true, status: true } } } },
    blocks: { include: { blocked: { select: { id: true, title: true, status: true } } } },
    calendarEvents: true,
  },
});

export type TaskWithRelations = Prisma.TaskGetPayload<typeof taskWithRelations>;
export const taskInclude = taskWithRelations.include;

export function serializeTask(task: TaskWithRelations) {
  const dateBucket = computeDateBucket(task.dueDate);
  const bucket = task.pinnedToday ? "TODAY" : dateBucket;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    effort: task.effort,
    position: task.position,
    aiPriorityScore: task.aiPriorityScore,
    aiPriorityReason: task.aiPriorityReason,
    pinnedToday: task.pinnedToday,
    category: task.category,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    location: task.location,
    notes: task.notes,
    followUpRequired: task.followUpRequired,
    followUpDate: task.followUpDate,
    followUpPerson: task.followUpPerson,
    parentTaskId: task.parentTaskId,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    waitingAt: task.waitingAt,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
    isSeed: task.isSeed,
    steps: task.steps,
    people: task.people.map((tp) => tp.person),
    blockedBy: task.blockedBy.map((d) => d.blocker),
    blocks: task.blocks.map((d) => d.blocked),
    calendarEvents: task.calendarEvents,
    bucket,
    dateBucket,
    overdue: isOverdue(task.dueDate, task.status),
    isBlocked: task.blockedBy.some((d) => d.blocker.status !== TaskStatus.COMPLETED),
  };
}

export type SerializedTask = ReturnType<typeof serializeTask>;
