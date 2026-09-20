"use client";

import type { Task, Category } from "@/lib/types";
import TaskDetail from "./TaskDetail";

export default function TaskDetailPanel({
  task,
  categories,
  people,
  allTasks,
  onChange,
  onDelete,
  onClose,
  onCycleEffort,
}: {
  task: Task | null;
  categories: Category[];
  people: { id: string; name: string }[];
  allTasks: { id: string; title: string }[];
  onChange: (task: Task) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onCycleEffort: (e: React.MouseEvent) => void;
}) {
  if (!task) return null;

  return (
    <>
      {/* mobile: bottom sheet */}
      <div className="lg:hidden fixed inset-0 z-40 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t border-t border-border bg-surface animate-slide-up pb-[env(safe-area-inset-bottom)]">
        <Header onClose={onClose} />
        <TaskDetail
          task={task}
          categories={categories}
          people={people}
          allTasks={allTasks}
          onChange={onChange}
          onDelete={onDelete}
          onCycleEffort={onCycleEffort}
        />
      </div>

      {/* desktop: docked right panel */}
      <div className="hidden lg:block w-[360px] shrink-0 border-l border-border sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
        <Header onClose={onClose} />
        <TaskDetail
          task={task}
          categories={categories}
          people={people}
          allTasks={allTasks}
          onChange={onChange}
          onDelete={onDelete}
          onCycleEffort={onCycleEffort}
        />
      </div>
    </>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-surface z-10">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-2">Details</span>
      <button
        onClick={onClose}
        className="w-6 h-6 flex items-center justify-center rounded text-muted-2 hover:text-foreground hover:bg-surface-hover"
        title="Close"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
