import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Removes the demo rows (isSeed = true) so only real data remains. Session auth. */
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Children of seed tasks cascade. Events and tasks first so people/categories can go.
  const events = await prisma.calendarEvent.deleteMany({ where: { isSeed: true } });
  const subtasks = await prisma.task.deleteMany({ where: { isSeed: true, parentTaskId: { not: null } } });
  const tasks = await prisma.task.deleteMany({ where: { isSeed: true } });
  const people = await prisma.person.deleteMany({ where: { isSeed: true } });
  const categories = await prisma.category.deleteMany({ where: { isSeed: true } });
  return NextResponse.json({
    events: events.count,
    tasks: tasks.count + subtasks.count,
    people: people.count,
    categories: categories.count,
  });
}
