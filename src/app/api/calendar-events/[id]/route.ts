import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calendarEventUpdateSchema } from "@/lib/validation";
import { Prisma } from "@prisma/client";
import { deleteEventFromGoogle, pushEventToGoogle } from "@/lib/google";
import { resolveTz } from "@/lib/hub-data";
import { isLockedSource } from "@/lib/calendar-utils";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = calendarEventUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const current = await prisma.calendarEvent.findUnique({ where: { id }, select: { source: true } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isLockedSource(current.source)) {
    // Calendly and Fathom own these. Only the person link can change here.
    const keys = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
    if (keys.some((k) => k !== "personId")) return NextResponse.json({ error: `This event comes from ${current.source}. Change it there.` }, { status: 409 });
  }

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

  if (isLockedSource(event.source)) return NextResponse.json(event);
  const pushed = await pushEventToGoogle(event, await resolveTz(new URL(req.url).searchParams.get("tz")));
  if ("externalId" in pushed && !event.externalId) {
    await prisma.calendarEvent.update({ where: { id }, data: { externalId: pushed.externalId, source: "google" } });
    return NextResponse.json({ ...event, externalId: pushed.externalId, source: "google", google: "saved" });
  }
  return NextResponse.json({ ...event, google: "externalId" in pushed ? "saved" : "error" in pushed ? pushed.error : pushed.skipped });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const current = await prisma.calendarEvent.findUnique({ where: { id }, select: { source: true, externalId: true } });
  if (!current) return NextResponse.json({ ok: true });
  if (current.source === "calendly") return NextResponse.json({ error: "This is a Calendly booking. Cancel it in Calendly." }, { status: 409 });
  const removed = await deleteEventFromGoogle(current.externalId);
  if ("error" in removed) return NextResponse.json({ error: removed.error }, { status: 502 });
  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
