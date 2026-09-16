import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { personUpdateSchema } from "@/lib/validation";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { TaskStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const linkedTasks = await prisma.task.findMany({
    where: { OR: [{ people: { some: { personId: id } } }, { followUpPersonId: id }] },
    include: taskInclude,
    orderBy: { position: "asc" },
  });

  const events = await prisma.calendarEvent.findMany({
    where: { personId: id },
    orderBy: { date: "asc" },
    include: { category: true, task: { select: { id: true, title: true, status: true } } },
  });

  const contextItems = await prisma.contextItem.findMany({
    where: { personId: id },
    orderBy: { timestamp: "desc" },
    take: 20,
  });

  const tasks = linkedTasks.map(serializeTask);

  return NextResponse.json({
    ...person,
    tasks,
    activeTasks: tasks.filter((t) => t.status !== TaskStatus.COMPLETED),
    waitingTasks: tasks.filter((t) => t.status === TaskStatus.WAITING),
    completedTasks: tasks.filter((t) => t.status === TaskStatus.COMPLETED),
    upcomingTasks: tasks.filter((t) => t.dueDate && t.status !== TaskStatus.COMPLETED),
    events,
    contextItems,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = personUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const person = await prisma.person.update({ where: { id }, data: parsed.data });
  return NextResponse.json(person);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.person.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
