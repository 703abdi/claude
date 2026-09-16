import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { taskCreateSchema } from "@/lib/validation";
import { TaskStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const includeCompleted = searchParams.get("includeCompleted") === "true";

  const where: import("@prisma/client").Prisma.TaskWhereInput = {};
  if (status) {
    where.status = status as TaskStatus;
  } else if (!includeCompleted) {
    where.status = { not: TaskStatus.COMPLETED };
  }

  const categoryId = searchParams.get("categoryId");
  if (categoryId) where.categoryId = categoryId;

  const effort = searchParams.get("effort");
  if (effort) where.effort = effort as import("@prisma/client").Effort;

  const personId = searchParams.get("personId");
  if (personId) where.people = { some: { personId } };

  const waiting = searchParams.get("waiting");
  if (waiting === "true") where.status = TaskStatus.WAITING;

  const tasks = await prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: { position: "asc" },
  });

  return NextResponse.json(tasks.map(serializeTask));
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = taskCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const maxPositionTask = await prisma.task.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (maxPositionTask?.position ?? 0) + 1000;

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      categoryId: data.categoryId ?? null,
      effort: data.effort ?? "LOW",
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      dueTime: data.dueTime ?? null,
      location: data.location ?? null,
      notes: data.notes ?? null,
      pinnedToday: data.pinnedToday ?? false,
      followUpRequired: data.followUpRequired ?? false,
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      followUpPersonId: data.followUpPersonId ?? null,
      parentTaskId: data.parentTaskId ?? null,
      position,
      steps: data.steps?.length
        ? { create: data.steps.map((s, i) => ({ title: s.title, position: (i + 1) * 1000 })) }
        : undefined,
      people: data.personIds?.length
        ? { create: data.personIds.map((personId) => ({ personId })) }
        : undefined,
    },
    include: taskInclude,
  });

  await prisma.taskEvent.create({
    data: { taskId: task.id, type: "created", toValue: task.status },
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
}
