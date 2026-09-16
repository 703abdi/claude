import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { personCreateSchema } from "@/lib/validation";
import { TaskStatus } from "@prisma/client";

export async function GET() {
  const people = await prisma.person.findMany({
    orderBy: { name: "asc" },
    include: {
      tasks: { include: { task: { select: { id: true, status: true, dueDate: true } } } },
      followUpTasks: { select: { id: true, status: true, followUpRequired: true } },
    },
  });

  const result = people.map((p) => {
    const linkedTasks = p.tasks.map((tp) => tp.task);
    const allTasks = [...linkedTasks, ...p.followUpTasks];
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

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = personCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const existing = await prisma.person.findUnique({ where: { name: parsed.data.name } });
  if (existing) return NextResponse.json(existing, { status: 200 });

  const person = await prisma.person.create({ data: parsed.data });
  return NextResponse.json(person, { status: 201 });
}
