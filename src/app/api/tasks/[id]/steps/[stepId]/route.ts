import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stepUpdateSchema } from "@/lib/validation";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { deriveStatusFromSteps, timestampsForTransition } from "@/lib/task-logic";
import { TaskStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string; stepId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, stepId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = stepUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const step = await prisma.taskStep.findUnique({ where: { id: stepId } });
  if (!step || step.taskId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.taskStep.update({
    where: { id: stepId },
    data: {
      title: data.title,
      position: data.position,
      done: data.done,
      doneAt: data.done === undefined ? undefined : data.done ? new Date() : null,
    },
  });

  // Re-derive parent task status from step completion state (spec §12/§14)
  const task = await prisma.task.findUnique({ where: { id }, include: { steps: true } });
  if (task && data.done !== undefined) {
    const nextStatus = deriveStatusFromSteps({
      currentStatus: task.status,
      steps: task.steps,
      followUpRequired: task.followUpRequired,
    });

    if (nextStatus !== task.status) {
      const ts = timestampsForTransition(task.status, nextStatus);
      await prisma.task.update({
        where: { id },
        data: {
          status: nextStatus,
          startedAt: ts.startedAt && !task.startedAt ? ts.startedAt : undefined,
          waitingAt: ts.waitingAt ?? undefined,
          completedAt:
            nextStatus === TaskStatus.COMPLETED
              ? ts.completedAt
              : nextStatus === TaskStatus.NOT_STARTED
                ? null
                : undefined,
        },
      });
      await prisma.taskEvent.create({
        data: {
          taskId: id,
          type: "status_changed",
          fromValue: task.status,
          toValue: nextStatus,
          actor: "user",
        },
      });
    }
  }

  const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  return NextResponse.json(serializeTask(updated!));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, stepId } = await params;
  const step = await prisma.taskStep.findUnique({ where: { id: stepId } });
  if (!step || step.taskId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.taskStep.delete({ where: { id: stepId } });

  const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  return NextResponse.json(serializeTask(updated!));
}
