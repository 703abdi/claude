import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stepCreateSchema } from "@/lib/validation";
import { taskInclude, serializeTask } from "@/lib/serialize";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = stepCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { id }, include: { steps: true } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const maxPos = task.steps.reduce((m, s) => Math.max(m, s.position), 0);
  await prisma.taskStep.create({
    data: { taskId: id, title: parsed.data.title, position: maxPos + 1000 },
  });

  const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  return NextResponse.json(serializeTask(updated!), { status: 201 });
}
