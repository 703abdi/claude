import { Suspense } from "react";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { taskInclude, serializeTask } from "@/lib/serialize";
import TasksView from "@/components/tasks/TasksView";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, categories, people] = await Promise.all([
    prisma.task.findMany({ where: { status: { not: TaskStatus.COMPLETED } }, include: taskInclude, orderBy: { position: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const initialTasks: Task[] = JSON.parse(JSON.stringify(tasks.map(serializeTask)));
  return (
    <Suspense fallback={null}>
      <TasksView initialTasks={initialTasks} categories={categories} people={people} />
    </Suspense>
  );
}
