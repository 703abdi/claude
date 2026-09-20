"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Task, Category, Suggestion } from "@/lib/types";
import { api } from "@/lib/api-client";
import ProgressHeader from "./ProgressHeader";
import FilterBar, { DEFAULT_FILTERS, type Filters } from "./FilterBar";
import SecondaryFiltersPopover from "./SecondaryFiltersPopover";
import LeftRail from "./LeftRail";
import TaskSection from "./TaskSection";
import TaskDetailPanel from "./TaskDetailPanel";
import TodayTimeline from "./TodayTimeline";
import NewTaskForm from "./NewTaskForm";
import CategoryManager from "./CategoryManager";
import SuggestionsPanel from "./SuggestionsPanel";
import { REALISTIC_TODAY_LIMIT_CLIENT } from "@/lib/client-constants";

const EFFORT_CYCLE = ["LOW", "MEDIUM", "HIGH"] as const;

type PersonLite = { id: string; name: string };

export default function TasksDashboard({
  initialTasks,
  initialCompletedCount,
  categories: initialCategories,
  people,
  initialSuggestions,
}: {
  initialTasks: Task[];
  initialCompletedCount: number;
  categories: Category[];
  people: PersonLite[];
  initialSuggestions: Suggestion[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [completedCount, setCompletedCount] = useState(initialCompletedCount);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Task[] | null>(null);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [managingCategories, setManagingCategories] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  async function refreshTasks() {
    const [freshActive, freshCompletedCount] = await Promise.all([api.tasks.list(), api.tasks.list({ status: "COMPLETED" })]);
    setTasks(freshActive);
    setCompletedCount(freshCompletedCount.length);
    if (completedTasks) setCompletedTasks(freshCompletedCount);
  }

  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (!highlightId) return;
    if (tasks.some((t) => t.id === highlightId)) return;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${highlightId}`);
        if (!res.ok) return;
        const t: Task = await res.json();
        if (t.status === "COMPLETED") {
          setShowCompleted(true);
          setCompletedTasks((prev) => {
            const list = prev ?? [];
            return list.some((x) => x.id === t.id) ? list : [...list, t];
          });
        }
      } catch {
        // task no longer exists — ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  function handleChange(updated: Task) {
    setTasks((prev) => {
      const wasCompleted = prev.find((t) => t.id === updated.id)?.status === "COMPLETED";
      const isNowCompleted = updated.status === "COMPLETED";
      if (isNowCompleted && !wasCompleted) {
        setCompletedCount((c) => c + 1);
        return prev.filter((t) => t.id !== updated.id);
      }
      if (!isNowCompleted && wasCompleted) {
        setCompletedCount((c) => Math.max(0, c - 1));
      }
      const exists = prev.some((t) => t.id === updated.id);
      if (!exists) return prev; // was completed, now un-completed elsewhere — refetch not needed for list view
      return prev.map((t) => (t.id === updated.id ? updated : t));
    });
    setCompletedTasks((prev) => (prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev));
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setCompletedTasks((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    setSelectedTaskId((prev) => (prev === id ? null : prev));
  }

  function handleCreated(task: Task) {
    setTasks((prev) => [...prev, task]);
  }

  function handleReorder(bucketTasks: Task[], orderedIds: string[]) {
    const orderedSet = new Set(orderedIds);
    const reorderedMap = new Map(orderedIds.map((id, i) => [id, i]));
    setTasks((prev) => {
      const untouched = prev.filter((t) => !orderedSet.has(t.id));
      const touched = prev
        .filter((t) => orderedSet.has(t.id))
        .sort((a, b) => (reorderedMap.get(a.id) ?? 0) - (reorderedMap.get(b.id) ?? 0));
      // preserve original relative ordering of untouched + reinsert touched in place — simplest: merge by id set membership
      const result: Task[] = [];
      let ti = 0;
      for (const t of prev) {
        if (orderedSet.has(t.id)) {
          result.push(touched[ti]);
          ti++;
        } else {
          result.push(t);
        }
      }
      return result;
    });
  }

  async function loadCompleted() {
    if (completedTasks) {
      setShowCompleted((v) => !v);
      return;
    }
    const data = await api.tasks.list({ status: "COMPLETED" });
    setCompletedTasks(data);
    setShowCompleted(true);
  }

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.bucket !== "ALL" && t.bucket !== filters.bucket) return false;
      if (filters.categoryId && t.category?.id !== filters.categoryId) return false;
      if (filters.effort && t.effort !== filters.effort) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.personId && !t.people.some((p) => p.id === filters.personId)) return false;
      if (filters.overdueOnly && !t.overdue) return false;
      if (filters.waitingOnly && t.status !== "WAITING") return false;
      return true;
    });
  }, [tasks, filters]);

  const buckets = useMemo(() => {
    const today = filtered.filter((t) => t.bucket === "TODAY");
    const now = filtered.filter((t) => t.bucket === "NOW");
    const next = filtered.filter((t) => t.bucket === "NEXT");
    const later = filtered.filter((t) => t.bucket === "LATER");
    return { today, now, next, later };
  }, [filtered]);

  const taskTitles = useMemo(() => tasks.map((t) => ({ id: t.id, title: t.title })), [tasks]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((t) => t.id === selectedTaskId) ?? completedTasks?.find((t) => t.id === selectedTaskId) ?? null;
  }, [selectedTaskId, tasks, completedTasks]);

  async function cycleSelectedEffort(e: React.MouseEvent) {
    e.stopPropagation();
    if (!selectedTask) return;
    const idx = EFFORT_CYCLE.indexOf(selectedTask.effort);
    const next = EFFORT_CYCLE[(idx + 1) % EFFORT_CYCLE.length];
    const updated = await api.tasks.update(selectedTask.id, { effort: next });
    handleChange(updated);
  }

  const totalActive = tasks.length;
  const totalAll = totalActive + completedCount;

  const todayOverloaded = buckets.today.length > REALISTIC_TODAY_LIMIT_CLIENT;
  const focusToday = useMemo(() => {
    if (!todayOverloaded) return buckets.today;
    const effortWeight: Record<string, number> = { LOW: 0, MEDIUM: -0.5, HIGH: -1 };
    return [...buckets.today]
      .sort((a, b) => {
        const scoreA = (a.overdue ? 3 : 0) + (a.followUpRequired ? 1.5 : 0) + (a.aiPriorityScore ?? 0) * 2 + (effortWeight[a.effort] ?? 0);
        const scoreB = (b.overdue ? 3 : 0) + (b.followUpRequired ? 1.5 : 0) + (b.aiPriorityScore ?? 0) * 2 + (effortWeight[b.effort] ?? 0);
        return scoreB - scoreA;
      })
      .slice(0, REALISTIC_TODAY_LIMIT_CLIENT);
  }, [todayOverloaded, buckets.today]);

  return (
    <div className="flex items-start">
      <LeftRail
        tasks={tasks}
        categories={categories}
        filters={filters}
        onChange={setFilters}
        onManageCategories={() => setManagingCategories(true)}
      />

      <div className="flex-1 min-w-0 px-4 lg:px-6 py-4">
        <ProgressHeader completed={completedCount} total={totalAll} />

        <div className="flex items-start gap-2 mb-4">
          <div className="lg:hidden flex-1">
            <FilterBar filters={filters} onChange={setFilters} categories={categories} people={people} />
          </div>
          <button
            onClick={() => setManagingCategories(true)}
            className="lg:hidden text-xs text-muted hover:text-foreground shrink-0 mt-2"
          >
            Manage categories
          </button>
          <div className="hidden lg:flex ml-auto">
            <SecondaryFiltersPopover filters={filters} onChange={setFilters} people={people} />
          </div>
        </div>

        {managingCategories && (
          <CategoryManager
            categories={categories}
            onChange={setCategories}
            onClose={async () => {
              setManagingCategories(false);
              const [freshActive, freshCompleted] = await Promise.all([
                api.tasks.list(),
                completedTasks ? api.tasks.list({ status: "COMPLETED" }) : Promise.resolve(null),
              ]);
              setTasks(freshActive);
              if (freshCompleted) setCompletedTasks(freshCompleted);
            }}
          />
        )}

        <SuggestionsPanel initialSuggestions={initialSuggestions} onTaskUpdated={refreshTasks} />

        <NewTaskForm categories={categories} people={people} onCreated={handleCreated} />

        {todayOverloaded && filters.bucket !== "LATER" && (
          <div className="mb-6 text-sm border border-due-today/40 bg-due-today/10 text-due-today rounded px-3 py-2.5">
            You currently have {buckets.today.length} tasks marked Today — probably more than you can realistically
            finish. Here are the {REALISTIC_TODAY_LIMIT_CLIENT} highest-priority ones; the rest stay pinned below.
          </div>
        )}

        {(filters.bucket === "ALL" || filters.bucket === "TODAY") && buckets.today.length > 0 && (
          <TodayTimeline tasks={buckets.today} selectedTaskId={selectedTaskId} onSelect={(t) => setSelectedTaskId(t.id)} />
        )}

        {(filters.bucket === "ALL" || filters.bucket === "TODAY") && (
          <TaskSection
            title="Today"
            subtitle={todayOverloaded ? "focus set" : undefined}
            tasks={todayOverloaded ? focusToday : buckets.today}
            onChange={handleChange}
            onSelect={(t) => setSelectedTaskId(t.id)}
            selectedTaskId={selectedTaskId}
            onReorder={(ids) => handleReorder(buckets.today, ids)}
            emptyState="You're clear for today."
            highlightId={highlightId}
          />
        )}
        {todayOverloaded && (filters.bucket === "ALL" || filters.bucket === "TODAY") && (
          <TaskSection
            title="Also pinned to Today"
            tasks={buckets.today.filter((t) => !focusToday.some((f) => f.id === t.id))}
            onChange={handleChange}
            onSelect={(t) => setSelectedTaskId(t.id)}
            selectedTaskId={selectedTaskId}
            onReorder={(ids) => handleReorder(buckets.today, ids)}
            emptyState=""
            highlightId={highlightId}
          />
        )}

        {(filters.bucket === "ALL" || filters.bucket === "NOW") && (
          <TaskSection
            title="Now"
            tasks={buckets.now}
            onChange={handleChange}
            onSelect={(t) => setSelectedTaskId(t.id)}
            selectedTaskId={selectedTaskId}
            onReorder={(ids) => handleReorder(buckets.now, ids)}
            emptyState="Nothing outstanding in the next 48 hours."
            highlightId={highlightId}
          />
        )}

        {(filters.bucket === "ALL" || filters.bucket === "NEXT") && (
          <TaskSection
            title="Next"
            tasks={buckets.next}
            onChange={handleChange}
            onSelect={(t) => setSelectedTaskId(t.id)}
            selectedTaskId={selectedTaskId}
            onReorder={(ids) => handleReorder(buckets.next, ids)}
            emptyState="Nothing outstanding this week."
            highlightId={highlightId}
          />
        )}

        {(filters.bucket === "ALL" || filters.bucket === "LATER") && (
          <TaskSection
            title="Later"
            tasks={buckets.later}
            onChange={handleChange}
            onSelect={(t) => setSelectedTaskId(t.id)}
            selectedTaskId={selectedTaskId}
            onReorder={(ids) => handleReorder(buckets.later, ids)}
            emptyState="Nothing outstanding."
            highlightId={highlightId}
          />
        )}

        {totalActive === 0 && <p className="text-sm text-muted-2 py-6 text-center">Nothing outstanding.</p>}

        <div className="mt-8 border-t border-border pt-4 pb-16 lg:pb-8">
          <button
            onClick={loadCompleted}
            className="font-mono text-[11px] font-medium text-muted hover:text-foreground uppercase tracking-wide"
          >
            Completed ({completedCount}) {showCompleted ? "▲" : "▼"}
          </button>
          {showCompleted && completedTasks && (
            <div className="mt-3 opacity-80">
              <TaskSection
                title=""
                tasks={completedTasks}
                onChange={handleChange}
                onSelect={(t) => setSelectedTaskId(t.id)}
                selectedTaskId={selectedTaskId}
                onReorder={() => {}}
                emptyState="Nothing completed yet."
                highlightId={highlightId}
              />
            </div>
          )}
        </div>
      </div>

      <TaskDetailPanel
        task={selectedTask}
        categories={categories}
        people={people}
        allTasks={taskTitles}
        onChange={handleChange}
        onDelete={handleDelete}
        onClose={() => setSelectedTaskId(null)}
        onCycleEffort={cycleSelectedEffort}
      />
    </div>
  );
}
