import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { TaskStatus } from "@prisma/client";
import TasksDashboard from "@/components/tasks/TasksDashboard";
import MorningBriefTeaser from "@/components/tasks/MorningBriefTeaser";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await getSession();
  const [tasks, completedCount, categories, people, suggestions, latestBrief, user] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: TaskStatus.COMPLETED } },
      include: taskInclude,
      orderBy: { position: "asc" },
    }),
    prisma.task.count({ where: { status: TaskStatus.COMPLETED } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.suggestion.findMany({
      where: { status: "PENDING", OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] },
      include: {
        relatedTask: { select: { id: true, title: true, status: true } },
        relatedPerson: { select: { id: true, name: true } },
        relatedContext: { select: { id: true, content: true, source: true, sourceUrl: true, timestamp: true } },
      },
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    }),
    prisma.morningBrief.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    session ? prisma.user.findUnique({ where: { id: session.userId }, select: { morningBriefTime: true } }) : null,
  ]);

  const initialTasks: import("@/lib/types").Task[] = JSON.parse(JSON.stringify(tasks.map(serializeTask)));
  const initialSuggestions: import("@/lib/types").Suggestion[] = JSON.parse(JSON.stringify(suggestions));
  const hasBriefToday = !!latestBrief && latestBrief.createdAt.toDateString() === new Date().toDateString();

  return (
    <Suspense fallback={null}>
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6">
        <MorningBriefTeaser hasBriefToday={hasBriefToday} briefTime={user?.morningBriefTime ?? "6:00 AM"} />
      </div>
      <TasksDashboard
        initialTasks={initialTasks}
        initialCompletedCount={completedCount}
        categories={categories}
        people={people}
        initialSuggestions={initialSuggestions}
      />
    </Suspense>
  );
}
