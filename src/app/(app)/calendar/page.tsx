import { prisma } from "@/lib/prisma";
import CalendarView from "@/components/calendar/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [events, tasksWithDates, categories, people] = await Promise.all([
    prisma.calendarEvent.findMany({
      include: {
        category: true,
        person: true,
        task: { select: { id: true, title: true, status: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.task.findMany({
      where: { dueDate: { not: null } },
      select: { id: true, title: true, status: true, dueDate: true, dueTime: true, category: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <CalendarView
      initialEvents={JSON.parse(JSON.stringify(events))}
      initialTasksWithDates={JSON.parse(JSON.stringify(tasksWithDates))}
      categories={categories}
      people={people}
    />
  );
}
