"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Task, Category, Suggestion } from "@/lib/types";
import { api } from "@/lib/api-client";
import { daysBetween, daysPastDue, isAutoCleared, AUTO_CLEAR_AFTER_DAYS } from "@/lib/task-dates";
import type { RailView } from "./railView";
import type { Filters } from "./FilterBar";
import { DEFAULT_FILTERS } from "./FilterBar";
import SecondaryFiltersPopover from "./SecondaryFiltersPopover";
import LeftRail from "./LeftRail";
import StatHeader from "./StatHeader";
import QuickAddBar from "./QuickAddBar";
import DecisionBanner from "./DecisionBanner";
import TaskSection from "./TaskSection";
import TaskDetailPanel from "./TaskDetailPanel";
import RightSidebar from "./RightSidebar";
import CommandPalette from "./CommandPalette";
import ShortcutsCheatsheet from "./ShortcutsCheatsheet";
import CategoryManager from "./CategoryManager";
import { REALISTIC_TODAY_LIMIT_CLIENT } from "@/lib/client-constants";

const EFFORT_CYCLE = ["LOW", "MEDIUM", "HIGH"] as const;

const VIEWS: RailView[] = ["FOCUS", "UPCOMING", "WAITING", "SOMEDAY", "DONE", "AUTO_CLEARED"];
const VIEW_LABEL: Record<RailView, string> = {
  FOCUS: "Focus",
  UPCOMING: "Upcoming",
  WAITING: "Waiting on others",
  SOMEDAY: "Someday",
  DONE: "Done",
  AUTO_CLEARED: "Auto-cleared",
};
const EMPTY_STATE: Record<RailView, string> = {
  FOCUS: "You're clear for today.",
  UPCOMING: "Nothing coming up.",
  WAITING: "Nothing waiting on anyone.",
  SOMEDAY: "Nothing parked for later.",
  DONE: "Nothing completed yet.",
  AUTO_CLEARED: "Nothing has auto-cleared.",
};

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
  const [completedTasks, setCompletedTasks] = useState<Task[] | null>(null);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [managingCategories, setManagingCategories] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [railView, setRailView] = useState<RailView>("FOCUS");
  const [categoryId, setCategoryId] = useState("");
  const [secondaryFilters, setSecondaryFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions);

  useEffect(() => {
    api.tasks.list({ status: "COMPLETED" }).then((data) => {
      setCompletedTasks(data);
      setCompletedCount(data.length);
    });
  }, []);

  useEffect(() => {
    function open() {
      setPaletteOpen(true);
    }
    window.addEventListener("open-command-palette", open);
    return () => window.removeEventListener("open-command-palette", open);
  }, []);

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
          setRailView("DONE");
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
        setCompletedTasks((prev2) => (prev2 ? [updated, ...prev2] : prev2));
        return prev.filter((t) => t.id !== updated.id);
      }
      if (!isNowCompleted && wasCompleted) {
        setCompletedCount((c) => Math.max(0, c - 1));
        setCompletedTasks((prev2) => (prev2 ? prev2.filter((t) => t.id !== updated.id) : prev2));
        return [...prev, updated];
      }
      const exists = prev.some((t) => t.id === updated.id);
      if (!exists) return prev;
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
      const touched = prev
        .filter((t) => orderedSet.has(t.id))
        .sort((a, b) => (reorderedMap.get(a.id) ?? 0) - (reorderedMap.get(b.id) ?? 0));
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

  const visibleActive = useMemo(() => tasks.filter((t) => !isAutoCleared(t.dueDate, t.overdue)), [tasks]);
  const autoCleared = useMemo(() => tasks.filter((t) => isAutoCleared(t.dueDate, t.overdue)), [tasks]);
  const waitingTasks = useMemo(() => visibleActive.filter((t) => t.status === "WAITING"), [visibleActive]);
  const focusTasks = useMemo(
    () => visibleActive.filter((t) => t.status !== "WAITING" && t.bucket === "TODAY"),
    [visibleActive]
  );
  const upcomingTasks = useMemo(
    () => visibleActive.filter((t) => t.status !== "WAITING" && (t.bucket === "NOW" || t.bucket === "NEXT")),
    [visibleActive]
  );
  const somedayTasks = useMemo(
    () => visibleActive.filter((t) => t.status !== "WAITING" && t.bucket === "LATER"),
    [visibleActive]
  );
  const decisionTasks = useMemo(() => visibleActive.filter((t) => t.overdue), [visibleActive]);

  const currentList = useMemo(() => {
    switch (railView) {
      case "FOCUS":
        return focusTasks;
      case "UPCOMING":
        return upcomingTasks;
      case "WAITING":
        return waitingTasks;
      case "SOMEDAY":
        return somedayTasks;
      case "DONE":
        return completedTasks ?? [];
      case "AUTO_CLEARED":
        return autoCleared;
    }
  }, [railView, focusTasks, upcomingTasks, waitingTasks, somedayTasks, completedTasks, autoCleared]);

  const filteredCurrentList = useMemo(() => {
    return currentList.filter((t) => {
      if (categoryId && t.category?.id !== categoryId) return false;
      if (secondaryFilters.effort && t.effort !== secondaryFilters.effort) return false;
      if (secondaryFilters.status && t.status !== secondaryFilters.status) return false;
      if (secondaryFilters.personId && !t.people.some((p) => p.id === secondaryFilters.personId)) return false;
      return true;
    });
  }, [currentList, categoryId, secondaryFilters]);

  const categoryCounts = useMemo(
    () => new Map(categories.map((c) => [c.id, visibleActive.filter((t) => t.category?.id === c.id).length])),
    [categories, visibleActive]
  );

  const taskTitles = useMemo(() => tasks.map((t) => ({ id: t.id, title: t.title })), [tasks]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return (
      tasks.find((t) => t.id === selectedTaskId) ??
      completedTasks?.find((t) => t.id === selectedTaskId) ??
      autoCleared.find((t) => t.id === selectedTaskId) ??
      null
    );
  }, [selectedTaskId, tasks, completedTasks, autoCleared]);

  async function cycleSelectedEffort(e: React.MouseEvent) {
    e.stopPropagation();
    if (!selectedTask) return;
    const idx = EFFORT_CYCLE.indexOf(selectedTask.effort);
    const next = EFFORT_CYCLE[(idx + 1) % EFFORT_CYCLE.length];
    const updated = await api.tasks.update(selectedTask.id, { effort: next });
    handleChange(updated);
  }

  function withinLastDays(dateStr: string | null, n: number) {
    if (!dateStr) return false;
    const diff = daysBetween(new Date(dateStr), new Date());
    return diff >= 0 && diff <= n;
  }
  const doneThisWeek = useMemo(
    () => (completedTasks ?? []).filter((t) => withinLastDays(t.completedAt, 6)).length,
    [completedTasks]
  );
  const doneThisWeekTotal = doneThisWeek + visibleActive.length;

  const visibleOrderedTasks = filteredCurrentList;

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        else if (cheatsheetOpen) setCheatsheetOpen(false);
        else if (selectedTaskId) setSelectedTaskId(null);
        return;
      }
      if (isTypingTarget(e.target) || paletteOpen) return;

      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setCheatsheetOpen((v) => !v);
      } else if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        if (visibleOrderedTasks.length === 0) return;
        const idx = visibleOrderedTasks.findIndex((t) => t.id === cursorId);
        const nextIdx =
          idx === -1 ? 0 : e.key === "j" ? Math.min(visibleOrderedTasks.length - 1, idx + 1) : Math.max(0, idx - 1);
        setCursorId(visibleOrderedTasks[nextIdx].id);
      } else if ((e.key === "e" || e.key === "Enter") && cursorId) {
        e.preventDefault();
        setSelectedTaskId(cursorId);
      } else if (e.key === "x" && cursorId) {
        e.preventDefault();
        const t = visibleOrderedTasks.find((vt) => vt.id === cursorId);
        if (t) api.tasks.update(t.id, { status: t.status === "COMPLETED" ? "NOT_STARTED" : "COMPLETED" }).then(handleChange);
      } else if (["1", "2", "3", "4", "5", "6"].includes(e.key)) {
        e.preventDefault();
        setRailView(VIEWS[Number(e.key) - 1]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, cheatsheetOpen, selectedTaskId, cursorId, visibleOrderedTasks]);

  return (
    <>
      <div className="flex items-start">
        <LeftRail
          railView={railView}
          onRailViewChange={setRailView}
          counts={{
            FOCUS: focusTasks.length,
            UPCOMING: upcomingTasks.length,
            WAITING: waitingTasks.length,
            SOMEDAY: somedayTasks.length,
            DONE: completedCount,
            AUTO_CLEARED: autoCleared.length,
          }}
          categories={categories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
          categoryCounts={categoryCounts}
          onManageCategories={() => setManagingCategories(true)}
        />

        <div className="flex-1 min-w-0 px-4 lg:px-6 py-4">
          {/* mobile rail switcher */}
          <div className="lg:hidden -mx-4 px-4 mb-4 flex gap-2 overflow-x-auto pb-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setRailView(v)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                  railView === v ? "bg-accent text-white" : "bg-surface-2 text-muted"
                }`}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>

          <div className="flex items-start justify-between gap-3">
            <StatHeader
              railView={railView}
              doneThisWeek={doneThisWeek}
              doneThisWeekTotal={doneThisWeekTotal}
              needDecision={decisionTasks.length}
              focusCount={focusTasks.length}
              focusLimit={REALISTIC_TODAY_LIMIT_CLIENT}
            />
          </div>

          <div className="hidden lg:flex justify-end mb-2">
            <SecondaryFiltersPopover filters={secondaryFilters} onChange={setSecondaryFilters} people={people} />
          </div>

          <QuickAddBar categories={categories} onCreated={handleCreated} />

          {managingCategories && (
            <CategoryManager
              categories={categories}
              onChange={setCategories}
              onClose={async () => {
                setManagingCategories(false);
                const freshActive = await api.tasks.list();
                setTasks(freshActive);
              }}
            />
          )}

          {railView === "FOCUS" && (
            <DecisionBanner tasks={decisionTasks} onChange={handleChange} onSelect={(t) => setSelectedTaskId(t.id)} />
          )}

          {railView === "FOCUS" && (
            <p className="text-sm text-muted mb-2">
              Aim for {REALISTIC_TODAY_LIMIT_CLIENT}. You have {focusTasks.length}.
            </p>
          )}

          {railView === "AUTO_CLEARED" ? (
            <AutoClearedList tasks={filteredCurrentList} onChange={handleChange} onSelect={(t) => setSelectedTaskId(t.id)} />
          ) : (
            <TaskSection
              title=""
              tasks={filteredCurrentList}
              onChange={handleChange}
              onSelect={(t) => setSelectedTaskId(t.id)}
              selectedTaskId={selectedTaskId}
              cursorId={cursorId}
              showFocusActions={railView === "FOCUS"}
              onReorder={(ids) => handleReorder(currentList, ids)}
              emptyState={EMPTY_STATE[railView]}
              highlightId={highlightId}
            />
          )}

          <div className="pb-16 lg:pb-8" />
        </div>

        <RightSidebar
          waitingTasks={waitingTasks}
          suggestions={suggestions}
          onSelectTask={(t) => setSelectedTaskId(t.id)}
          onSuggestionResolved={(id) => setSuggestions((prev) => prev.filter((s) => s.id !== id))}
        />
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        tasks={tasks}
        onSelectTask={(t) => setSelectedTaskId(t.id)}
        onSetRailView={setRailView}
        onNewTask={() => document.getElementById("new-task-trigger")?.focus()}
        onManageCategories={() => setManagingCategories(true)}
      />
      <ShortcutsCheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
    </>
  );
}

function AutoClearedList({
  tasks,
  onChange,
  onSelect,
}: {
  tasks: Task[];
  onChange: (task: Task) => void;
  onSelect: (task: Task) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function restore(task: Task) {
    setBusyId(task.id);
    try {
      const updated = await api.tasks.update(task.id, { dueDate: new Date().toISOString(), pinnedToday: true });
      onChange(updated);
    } finally {
      setBusyId(null);
    }
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-2 py-3 px-0.5">Nothing has auto-cleared.</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const late = daysPastDue(t.dueDate) ?? AUTO_CLEAR_AFTER_DAYS;
        return (
          <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            {t.category && (
              <span
                className="shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${t.category.color}22`, color: t.category.color }}
              >
                {t.category.name}
              </span>
            )}
            <button onClick={() => onSelect(t)} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold truncate">{t.title}</p>
              <p className="text-[11px] text-muted-2">{late}d late</p>
            </button>
            <button
              onClick={() => restore(t)}
              disabled={busyId === t.id}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-border text-muted hover:text-foreground hover:border-muted-2 transition-colors disabled:opacity-50"
            >
              Restore
            </button>
          </div>
        );
      })}
    </div>
  );
}
