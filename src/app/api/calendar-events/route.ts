import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calendarEventCreateSchema } from "@/lib/validation";
import { getFeedEvents } from "@/lib/calendar-feeds";
import { resolveTz } from "@/lib/hub-data";
import { pushEventToGoogle } from "@/lib/google";
import { isLockedSource } from "@/lib/calendar-utils";

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

  if (searchParams.get("feeds") !== "1") return NextResponse.json(events);

  // Read-only events from connected calendar feeds, merged in by date.
  const tz = await resolveTz(searchParams.get("tz"));
  const { events: feed } = await getFeedEvents(tz);
  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(to).getTime() : Infinity;
  const merged = [
    ...events.map((e) => ({ ...e, source: e.source ?? null, readOnly: isLockedSource(e.source) })),
    ...feed.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= fromMs && t <= toMs;
    }),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return NextResponse.json(merged);
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

  // Mirror it to Google when the connection can write. The local save stands either way.
  const pushed = await pushEventToGoogle(event, await resolveTz(new URL(req.url).searchParams.get("tz")));
  if ("externalId" in pushed) {
    const linked = await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { externalId: pushed.externalId, source: "google" },
      include: { category: true, person: true, task: { select: { id: true, title: true, status: true } } },
    });
    return NextResponse.json({ ...linked, google: "saved" }, { status: 201 });
  }
  return NextResponse.json({ ...event, google: "error" in pushed ? pushed.error : pushed.skipped }, { status: 201 });
}
