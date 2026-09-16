import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import { TaskStatus } from "@prisma/client";
import TasksDashboard from "@/components/tasks/TasksDashboard";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, completedCount, categories, people] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: TaskStatus.COMPLETED } },
      include: taskInclude,
      orderBy: { position: "asc" },
    }),
    prisma.task.count({ where: { status: TaskStatus.COMPLETED } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const initialTasks: import("@/lib/types").Task[] = JSON.parse(JSON.stringify(tasks.map(serializeTask)));

  return (
    <TasksDashboard
      initialTasks={initialTasks}
      initialCompletedCount={completedCount}
      categories={categories}
      people={people}
    />
  );
}
