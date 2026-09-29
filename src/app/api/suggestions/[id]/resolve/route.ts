import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { SuggestionStatus, SuggestionType } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["accept", "reject", "dismiss", "snooze", "edit"]),
  snoozeDays: z.number().min(1).max(30).optional(),
  edited: z
    .object({
      title: z.string().min(1),
      dueDate: z.string().datetime().optional().nullable(),
      categoryId: z.string().optional().nullable(),
    })
    .optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { action, snoozeDays, edited } = parsed.data;

  const suggestion = await prisma.suggestion.findUnique({ where: { id } });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "reject" || action === "dismiss") {
    await prisma.suggestion.update({
      where: { id },
      data: { status: action === "reject" ? SuggestionStatus.REJECTED : SuggestionStatus.DISMISSED, resolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "snooze") {
    const until = new Date();
    until.setDate(until.getDate() + (snoozeDays ?? 3));
    await prisma.suggestion.update({
      where: { id },
      data: { status: SuggestionStatus.SNOOZED, snoozedUntil: until },
    });
    return NextResponse.json({ ok: true });
  }

  // accept / edit
  let createdTaskId: string | null = null;

  const isTaskLevelSuggestion =
    suggestion.type === SuggestionType.OVERDUE ||
    suggestion.type === SuggestionType.BLOCKER ||
    suggestion.type === SuggestionType.UNFINISHED_FOLLOW_UP ||
    suggestion.type === SuggestionType.ABANDONED_TASK ||
    suggestion.type === SuggestionType.CROSS_SOURCE_LINK ||
    suggestion.type === SuggestionType.PRIORITY_CHANGE;

  if (suggestion.relatedTaskId && isTaskLevelSuggestion) {
    // Accepting a recommendation about an existing task elevates it — the
    // AI never silently reorders; this is the user explicitly agreeing.
    await prisma.task.update({
      where: { id: suggestion.relatedTaskId },
      data: { pinnedToday: true, aiPriorityScore: suggestion.confidence, aiPriorityReason: suggestion.reason },
    });
    createdTaskId = suggestion.relatedTaskId;
  } else {
    const maxPositionTask = await prisma.task.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const task = await prisma.task.create({
      data: {
        title: edited?.title ?? suggestion.title,
        description: suggestion.body,
        categoryId: edited?.categoryId ?? null,
        dueDate: edited?.dueDate ? new Date(edited.dueDate) : null,
        position: (maxPositionTask?.position ?? 0) + 1000,
        aiPriorityScore: suggestion.confidence,
        aiPriorityReason: suggestion.reason,
        people: suggestion.relatedPersonId ? { create: [{ personId: suggestion.relatedPersonId }] } : undefined,
      },
    });
    createdTaskId = task.id;
    await prisma.taskEvent.create({
      data: { taskId: task.id, type: "created", toValue: task.status, actor: "ai" },
    });
  }

  await prisma.suggestion.update({
    where: { id },
    data: {
      status: action === "edit" ? SuggestionStatus.EDITED : SuggestionStatus.ACCEPTED,
      resolvedAt: new Date(),
      relatedTaskId: createdTaskId,
    },
  });

  return NextResponse.json({ ok: true, taskId: createdTaskId });
}
