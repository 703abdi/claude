import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { TaskStatus } from "@prisma/client";
import TasksDashboard from "@/components/tasks/TasksDashboard";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, completedCount, categories, people, suggestions] = await Promise.all([
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
  ]);

  const initialTasks: import("@/lib/types").Task[] = JSON.parse(JSON.stringify(tasks.map(serializeTask)));
  const initialSuggestions: import("@/lib/types").Suggestion[] = JSON.parse(JSON.stringify(suggestions));

  return (
    <Suspense fallback={null}>
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
