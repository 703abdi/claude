import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calendarEventUpdateSchema } from "@/lib/validation";
import { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = calendarEventUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const updateData: Prisma.CalendarEventUpdateInput = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.date !== undefined) updateData.date = new Date(data.date);
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.allDay !== undefined) updateData.allDay = data.allDay;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.categoryId !== undefined)
    updateData.category = data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true };
  if (data.taskId !== undefined)
    updateData.task = data.taskId ? { connect: { id: data.taskId } } : { disconnect: true };
  if (data.personId !== undefined)
    updateData.person = data.personId ? { connect: { id: data.personId } } : { disconnect: true };

  const event = await prisma.calendarEvent.update({
    where: { id },
    data: updateData,
    include: {
      category: true,
      person: true,
      task: { select: { id: true, title: true, status: true } },
    },
  });

  return NextResponse.json(event);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
