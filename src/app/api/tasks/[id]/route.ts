import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { taskUpdateSchema } from "@/lib/validation";
import { timestampsForTransition } from "@/lib/task-logic";
import { TaskStatus, Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serializeTask(task));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = taskUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updateData: Prisma.TaskUpdateInput = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.categoryId !== undefined)
    updateData.category = data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true };
  if (data.effort !== undefined) updateData.effort = data.effort;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.dueTime !== undefined) updateData.dueTime = data.dueTime;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.pinnedToday !== undefined) updateData.pinnedToday = data.pinnedToday;
  if (data.followUpDate !== undefined)
    updateData.followUpDate = data.followUpDate ? new Date(data.followUpDate) : null;
  if (data.followUpPersonId !== undefined)
    updateData.followUpPerson = data.followUpPersonId
      ? { connect: { id: data.followUpPersonId } }
      : { disconnect: true };
  if (data.position !== undefined) updateData.position = data.position;
  if (data.parentTaskId !== undefined)
    updateData.parentTask = data.parentTaskId ? { connect: { id: data.parentTaskId } } : { disconnect: true };

  let followUpRequired = existing.followUpRequired;
  if (data.followUpRequired !== undefined) {
    followUpRequired = data.followUpRequired;
    updateData.followUpRequired = data.followUpRequired;
  }

  // Status transition (manual override — always respected, per spec §3/§18)
  let nextStatus = existing.status;
  if (data.status !== undefined && data.status !== existing.status) {
    nextStatus = data.status as TaskStatus;
    updateData.status = nextStatus;

    const ts = timestampsForTransition(existing.status, nextStatus);
    if (ts.startedAt && !existing.startedAt) updateData.startedAt = ts.startedAt;
    if (ts.waitingAt) updateData.waitingAt = ts.waitingAt;
    if (ts.completedAt) updateData.completedAt = ts.completedAt;
    if (nextStatus === TaskStatus.NOT_STARTED) {
      updateData.startedAt = null;
      updateData.waitingAt = null;
      updateData.completedAt = null;
    }
    if (nextStatus !== TaskStatus.COMPLETED) updateData.completedAt = null;
    if (nextStatus === TaskStatus.COMPLETED) updateData.followUpRequired = false;
  } else if (data.followUpRequired !== undefined) {
    // Follow-up flag toggled independent of steps: WAITING when required & work started, else respect current status
    if (followUpRequired && existing.status !== TaskStatus.COMPLETED) {
      nextStatus = TaskStatus.WAITING;
      updateData.status = TaskStatus.WAITING;
      if (!existing.waitingAt) updateData.waitingAt = new Date();
      if (!existing.startedAt) updateData.startedAt = new Date();
    }
  }

  if (data.personIds !== undefined) {
    updateData.people = {
      deleteMany: {},
      create: data.personIds.map((personId) => ({ personId })),
    };
  }

  const task = await prisma.task.update({
    where: { id },
    data: updateData,
    include: taskInclude,
  });

  if (data.status !== undefined && data.status !== existing.status) {
    await prisma.taskEvent.create({
      data: {
        taskId: id,
        type: "status_changed",
        fromValue: existing.status,
        toValue: nextStatus,
        actor: "user",
      },
    });
  }

  return NextResponse.json(serializeTask(task));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
