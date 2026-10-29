import { Prisma, TaskStatus } from "@prisma/client";
import { isOverdue } from "./task-logic";

type TaskForPriority = Prisma.TaskGetPayload<{
  include: {
    category: true;
    people: true;
    blocks: { include: { blocked: { select: { status: true } } } };
  };
}>;

/**
 * Deterministic, rule-based priority recommendation — implements the
 * hierarchy from spec §2: responsibility > blockers > deadlines > leverage
 * > everything else. Never touches `position` or `pinnedToday`: this is a
 * recommendation surfaced via aiPriorityScore/aiPriorityReason, and the
 * user's manual order always wins unless they explicitly accept it
 * (see /api/suggestions/[id]/resolve) — spec §3/§48.
 */
export function computeAiPriority(task: TaskForPriority, now: Date = new Date()) {
  let score = 0;
  const reasons: string[] = [];

  // Priority 1 — responsibility / amana: a promise, debt, or someone relying on you
  if (task.followUpRequired) {
    score += 3;
    reasons.push("a follow-up you owe someone is still open");
  }
  if (task.people.length > 0 && task.status !== TaskStatus.COMPLETED) {
    score += 1;
    reasons.push("another person is tied to this");
  }

  // Priority 2 — blockers: small tasks that unlock other work
  const blocksIncomplete = task.blocks.filter((d) => d.blocked.status !== TaskStatus.COMPLETED);
  if (blocksIncomplete.length > 0) {
    score += 2.5 + Math.min(blocksIncomplete.length, 3) * 0.3;
    reasons.push(
      `it's blocking ${blocksIncomplete.length} other ${blocksIncomplete.length === 1 ? "task" : "tasks"}`
    );
  }

  // Priority 3 — deadlines: overdue, then proximity
  if (isOverdue(task.dueDate, task.status)) {
    score += 3;
    reasons.push("it's overdue");
  } else if (task.dueDate) {
    const days = (task.dueDate.getTime() - now.getTime()) / 86400000;
    if (days <= 1) {
      score += 2;
      reasons.push("it's due within a day");
    } else if (days <= 3) {
      score += 1;
      reasons.push("it's due soon");
    }
  }

  // Priority 4 — leverage: infrastructure/relationship/systems work over one-off busywork
  const leverageCategories = ["business", "operations", "relationships", "trading offer"];
  if (task.category && leverageCategories.includes(task.category.name.toLowerCase())) {
    score += 0.5;
  }

  // Low-effort, high-unlock work floats up slightly (spec §2 Priority 2 example)
  if (task.effort === "LOW" && blocksIncomplete.length > 0) {
    score += 0.5;
  }

  const reason =
    reasons.length > 0
      ? `Recommended because ${reasons.join(" and ")}.`
      : "No urgent signal — default priority.";

  return { score: Math.round(score * 100) / 100, reason };
}
