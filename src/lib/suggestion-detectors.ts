import { prisma } from "./prisma";
import { TaskStatus, SuggestionType } from "@prisma/client";
import { isOverdue } from "./task-logic";
import {
  adjustConfidence,
  cooldownDaysFor,
  loadFeedbackProfile,
  passesFeedbackBar,
  type FeedbackProfile,
} from "./suggestion-feedback";

const ABANDONED_DAYS = 5;

async function shouldCreate(
  profile: FeedbackProfile,
  type: SuggestionType,
  relatedTaskId: string,
  relatedPersonId?: string
) {
  const existing = await prisma.suggestion.findFirst({
    where: { type, relatedTaskId, relatedPersonId: relatedPersonId ?? undefined },
    orderBy: { createdAt: "desc" },
  });
  if (!existing) return true;
  if (existing.status === "PENDING" || existing.status === "SNOOZED") return false;
  if (existing.status === "ACCEPTED") return false; // already actioned — don't nag again
  // REJECTED / DISMISSED / EDITED — resurface, but back off exponentially per
  // consecutive refusal of this same thread rather than on a flat schedule.
  if (!existing.resolvedAt) return true;
  const daysSince = (Date.now() - existing.resolvedAt.getTime()) / 86400000;
  return daysSince >= cooldownDaysFor(profile, type, relatedTaskId, relatedPersonId);
}

/**
 * Creates a suggestion unless this type has been refused often enough that
 * the signal no longer clears its own bar. Returns 1 if created, 0 if held.
 */
async function createSuggestion(
  profile: FeedbackProfile,
  type: SuggestionType,
  baseConfidence: number,
  data: {
    title: string;
    body: string;
    reason: string;
    relatedTaskId: string;
    relatedPersonId?: string | null;
  }
) {
  if (!passesFeedbackBar(profile, type, baseConfidence)) return 0;
  const confidence = adjustConfidence(profile, type, baseConfidence);
  await prisma.suggestion.create({ data: { type, confidence, ...data } });
  return 1;
}

/**
 * Rule-based suggestion detectors — independent of the LLM extraction
 * pipeline, so overdue/blocker/abandoned/follow-up detection keeps
 * working even with no ANTHROPIC_API_KEY configured. Safe to call
 * repeatedly (e.g. from the daily refresh): never deletes or mutates
 * tasks, only proposes.
 *
 * Confidence and cooldown are modulated by past accept/reject history
 * (see ./suggestion-feedback.ts) — the rules themselves are unchanged, so a
 * genuinely overdue task is still detected; it just gets said less often if
 * abdi has made clear he doesn't want to hear it.
 */
export async function runSuggestionDetectors() {
  const now = new Date();
  const abandonedCutoff = new Date(now.getTime() - ABANDONED_DAYS * 24 * 60 * 60 * 1000);

  const [profile, tasks] = await Promise.all([
    loadFeedbackProfile(),
    prisma.task.findMany({
      where: { status: { not: TaskStatus.COMPLETED } },
      include: {
        followUpPerson: true,
        blocks: { include: { blocked: { select: { id: true, title: true, status: true } } } },
      },
    }),
  ]);

  let created = 0;

  for (const task of tasks) {
    if (isOverdue(task.dueDate, task.status)) {
      if (await shouldCreate(profile, SuggestionType.OVERDUE, task.id)) {
        created += await createSuggestion(profile, SuggestionType.OVERDUE, 0.95, {
          title: `"${task.title}" is overdue`,
          body: `Due ${task.dueDate!.toDateString()}, still ${task.status.replace("_", " ").toLowerCase()}.`,
          reason: "Due date has passed and the task hasn't been completed.",
          relatedTaskId: task.id,
        });
      }
    }

    if (task.followUpRequired && task.followUpDate && task.followUpDate < now) {
      if (await shouldCreate(profile, SuggestionType.UNFINISHED_FOLLOW_UP, task.id)) {
        created += await createSuggestion(profile, SuggestionType.UNFINISHED_FOLLOW_UP, 0.85, {
          title: `Follow up on "${task.title}"`,
          body: `You planned to follow up by ${task.followUpDate.toDateString()}${
            task.followUpPerson ? ` with ${task.followUpPerson.name}` : ""
          }.`,
          reason: `Follow-up date (${task.followUpDate.toDateString()}) has passed.`,
          relatedTaskId: task.id,
          relatedPersonId: task.followUpPersonId,
        });
      }
    }

    if (task.status === TaskStatus.IN_PROGRESS && task.updatedAt < abandonedCutoff) {
      if (await shouldCreate(profile, SuggestionType.ABANDONED_TASK, task.id)) {
        const days = Math.floor((now.getTime() - task.updatedAt.getTime()) / 86400000);
        created += await createSuggestion(profile, SuggestionType.ABANDONED_TASK, 0.7, {
          title: `"${task.title}" hasn't moved in ${days} days`,
          body: "Started but stalled — worth checking if it's still relevant or needs a next step.",
          reason: `Status has been In Progress since ${task.updatedAt.toDateString()} with no update.`,
          relatedTaskId: task.id,
        });
      }
    }

    const incompleteBlocked = task.blocks.filter((d) => d.blocked.status !== TaskStatus.COMPLETED);
    if (incompleteBlocked.length > 0 && task.status !== TaskStatus.WAITING) {
      if (await shouldCreate(profile, SuggestionType.BLOCKER, task.id)) {
        created += await createSuggestion(profile, SuggestionType.BLOCKER, 0.8, {
          title: `"${task.title}" is blocking other work`,
          body: `${incompleteBlocked.length} task(s) can't move until this is done: ${incompleteBlocked
            .map((d) => d.blocked.title)
            .join(", ")}.`,
          reason: `${incompleteBlocked.length} incomplete task(s) list this as a dependency.`,
          relatedTaskId: task.id,
        });
      }
    }
  }

  // Person-level follow-up: anyone with an open WAITING task tied to them
  const waitingTasks = await prisma.task.findMany({
    where: { status: TaskStatus.WAITING },
    include: { people: { include: { person: true } }, followUpPerson: true },
  });
  const byPerson = new Map<string, { name: string; tasks: string[] }>();
  for (const t of waitingTasks) {
    const people = [...t.people.map((tp) => tp.person), ...(t.followUpPerson ? [t.followUpPerson] : [])];
    for (const p of people) {
      const entry = byPerson.get(p.id) ?? { name: p.name, tasks: [] };
      entry.tasks.push(t.title);
      byPerson.set(p.id, entry);
    }
  }
  for (const [personId, info] of byPerson) {
    const anyTaskId = waitingTasks.find((t) =>
      t.people.some((tp) => tp.personId === personId) || t.followUpPersonId === personId
    )?.id;
    if (!anyTaskId) continue;
    if (await shouldCreate(profile, SuggestionType.PERSON_FOLLOW_UP, anyTaskId, personId)) {
      created += await createSuggestion(profile, SuggestionType.PERSON_FOLLOW_UP, 0.75, {
        title: `Follow up with ${info.name}`,
        body: `${info.tasks.length} unresolved task(s) involving ${info.name}: ${info.tasks.join(", ")}.`,
        reason: "These tasks are marked Waiting and tied to this person.",
        relatedTaskId: anyTaskId,
        relatedPersonId: personId,
      });
    }
  }

  return { created };
}
