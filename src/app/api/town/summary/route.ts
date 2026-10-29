import { NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchAbdiformMetrics } from "@/lib/abdiform";
import type { TownSummary } from "@/lib/town-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
  const open = { status: { not: TaskStatus.COMPLETED } };

  const [openCount, overdue, dueToday, items, events, peopleCount, people, metrics] = await Promise.all([
    prisma.task.count({ where: open }),
    prisma.task.count({ where: { ...open, dueDate: { lt: startOfToday } } }),
    prisma.task.count({ where: { ...open, dueDate: { gte: startOfToday, lt: startOfTomorrow } } }),
    prisma.task.findMany({
      where: open,
      orderBy: { position: "asc" },
      take: 25,
      select: { id: true, title: true, dueDate: true },
    }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: startOfToday } },
      orderBy: { date: "asc" },
      take: 6,
      select: { id: true, title: true, date: true, startTime: true },
    }),
    prisma.person.count(),
    prisma.person.findMany({ orderBy: { name: "asc" }, take: 12, select: { id: true, name: true } }),
    fetchAbdiformMetrics(),
  ]);

  const summary: TownSummary = {
    tasks: {
      open: openCount,
      overdue,
      dueToday,
      items: items.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate?.toISOString() ?? null })),
    },
    calendar: {
      items: events.map((e) => ({ id: e.id, title: e.title, date: e.date.toISOString(), startTime: e.startTime })),
    },
    people: { count: peopleCount, names: people },
    metrics,
  };
  return NextResponse.json(summary);
}
