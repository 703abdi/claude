"use client";

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import type { Task } from "@/lib/types";
import { api } from "@/lib/api-client";
import TaskCard from "./TaskCard";

export default function TaskSection({
  title,
  subtitle,
  tasks,
  onChange,
  onReorder,
  onSelect,
  selectedTaskId,
  cursorId,
  showFocusActions,
  emptyState,
  highlightId,
}: {
  title: string;
  subtitle?: string;
  tasks: Task[];
  onChange: (task: Task) => void;
  onReorder: (orderedIds: string[]) => void;
  onSelect: (task: Task) => void;
  selectedTaskId?: string | null;
  cursorId?: string | null;
  showFocusActions?: boolean;
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
    <section className="mb-6">
      {title && (
        <div className="flex items-baseline gap-2 mb-2 px-0.5">
          <h2 className="text-[13px] font-semibold text-muted">{title}</h2>
          <span className="font-mono text-[11px] text-muted-2">{tasks.length}</span>
          {subtitle && <span className="text-[11px] text-muted-2 ml-1">{subtitle}</span>}
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-2 py-3 px-0.5">{emptyState}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onChange={onChange}
                  onSelect={onSelect}
                  selected={selectedTaskId === task.id}
                  cursor={cursorId === task.id}
                  showFocusActions={showFocusActions}
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
