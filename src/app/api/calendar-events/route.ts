import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calendarEventCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: import("@prisma/client").Prisma.CalendarEventWhereInput = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    include: {
      category: true,
      person: true,
      task: { select: { id: true, title: true, status: true } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = calendarEventCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const event = await prisma.calendarEvent.create({
    data: {
      title: data.title,
      date: new Date(data.date),
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      allDay: data.allDay ?? false,
      location: data.location ?? null,
      notes: data.notes ?? null,
      categoryId: data.categoryId ?? null,
      taskId: data.taskId ?? null,
      personId: data.personId ?? null,
    },
    include: {
      category: true,
      person: true,
      task: { select: { id: true, title: true, status: true } },
    },
  });

  return NextResponse.json(event, { status: 201 });
}
