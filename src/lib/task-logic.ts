import { TaskStatus } from "@prisma/client";

export type Bucket = "TODAY" | "NOW" | "NEXT" | "LATER";

/**
 * NOW/NEXT/LATER are computed from due date. TODAY is a curated pin
 * (pinnedToday) and is never implied by date alone — see spec §9.
 */
export function computeDateBucket(dueDate: Date | null): Exclude<Bucket, "TODAY"> {
  if (!dueDate) return "LATER";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = dueDate.getTime() - startOfToday.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 2) return "NOW"; // today .. ~48h (includes overdue)
  if (diffDays <= 7) return "NEXT"; // 3-7 days
  return "LATER";
}

export function isOverdue(dueDate: Date | null, status: TaskStatus): boolean {
  if (!dueDate || status === TaskStatus.COMPLETED) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dueDate.getTime() < startOfToday.getTime();
}

/** Recommended focus set when Today is overloaded — see spec §10. */
export const REALISTIC_TODAY_LIMIT = 5;

export function rankForToday<
  T extends {
    dueDate: Date | null;
    status: TaskStatus;
    effort: string;
    aiPriorityScore: number | null;
    followUpRequired: boolean;
  }
>(tasks: T[]): T[] {
  const effortWeight: Record<string, number> = { LOW: 0, MEDIUM: -0.5, HIGH: -1 };
  return [...tasks].sort((a, b) => {
    const scoreA =
      (isOverdue(a.dueDate, a.status) ? 3 : 0) +
      (a.followUpRequired ? 1.5 : 0) +
      (a.aiPriorityScore ?? 0) * 2 +
      (effortWeight[a.effort] ?? 0);
    const scoreB =
      (isOverdue(b.dueDate, b.status) ? 3 : 0) +
      (b.followUpRequired ? 1.5 : 0) +
      (b.aiPriorityScore ?? 0) * 2 +
      (effortWeight[b.effort] ?? 0);
    return scoreB - scoreA;
  });
}

/** Computes timestamp field updates for a status transition. Never rewrites history — only fills forward. */
export function timestampsForTransition(
  from: TaskStatus,
  to: TaskStatus,
  now: Date = new Date()
): Partial<{
  startedAt: Date;
  waitingAt: Date;
  completedAt: Date;
}> {
  if (from === to) return {};
  const updates: Partial<{ startedAt: Date; waitingAt: Date; completedAt: Date }> = {};
  if (to === TaskStatus.IN_PROGRESS || to === TaskStatus.WAITING || to === TaskStatus.COMPLETED) {
    updates.startedAt = now; // caller should only apply if not already set
  }
  if (to === TaskStatus.WAITING) updates.waitingAt = now;
  if (to === TaskStatus.COMPLETED) updates.completedAt = now;
  return updates;
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  NOT_STARTED: "var(--status-red)",
  IN_PROGRESS: "var(--status-orange)",
  WAITING: "var(--status-yellow)",
  COMPLETED: "var(--status-green)",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  COMPLETED: "Completed",
};

/**
 * Derives the correct status transition given current steps/follow-up state.
 * Never marks COMPLETED unless explicitly requested — completion requires
 * the caller to confirm there's no outstanding external responsibility.
 */
export function deriveStatusFromSteps(params: {
  currentStatus: TaskStatus;
  steps: { done: boolean }[];
  followUpRequired: boolean;
}): TaskStatus {
  const { currentStatus, steps, followUpRequired } = params;
  if (currentStatus === TaskStatus.COMPLETED) return TaskStatus.COMPLETED;

  const anyDone = steps.some((s) => s.done);
  const allDone = steps.length > 0 && steps.every((s) => s.done);

  if (!anyDone) return TaskStatus.NOT_STARTED;
  if (allDone && followUpRequired) return TaskStatus.WAITING;
  if (allDone && !followUpRequired) return TaskStatus.COMPLETED; // all internal work done, no external responsibility left
  return TaskStatus.IN_PROGRESS;
}
