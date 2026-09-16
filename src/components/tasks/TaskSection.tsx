"use client";

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import type { Task, Category } from "@/lib/types";
import { api } from "@/lib/api-client";
import TaskCard from "./TaskCard";

export default function TaskSection({
  title,
  subtitle,
  tasks,
  categories,
  people,
  onChange,
  onDelete,
  onReorder,
  emptyState,
  highlightId,
}: {
  title: string;
  subtitle?: string;
  tasks: Task[];
  categories: Category[];
  people: { id: string; name: string }[];
  onChange: (task: Task) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  emptyState: string;
  highlightId?: string | null;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    const ids = reordered.map((t) => t.id);
    onReorder(ids);

    const items = reordered.map((t, i) => ({ id: t.id, position: (i + 1) * 1000 }));
    await api.tasks.reorder(items);
  }

  return (
    <section className="mb-8">
      {title && (
        <div className="flex items-baseline gap-2 mb-2.5">
          <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
          <span className="text-xs text-muted-2">{tasks.length}</span>
          {subtitle && <span className="text-xs text-muted ml-1">{subtitle}</span>}
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-2 py-3">{emptyState}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  categories={categories}
                  people={people}
                  onChange={onChange}
                  onDelete={onDelete}
                  highlighted={highlightId === task.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
