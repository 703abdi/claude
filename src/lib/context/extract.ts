import { prisma } from "@/lib/prisma";
import { extractJson } from "@/lib/ai";
import { ContextType, SuggestionType, TaskStatus } from "@prisma/client";

type ExtractionResult = {
  contentType: keyof typeof ContextType;
  confidence: number;
  isActionable: boolean;
  mentionedPersonName: string | null;
  relatedExistingTaskId: string | null;
  suggestion: {
    type: keyof typeof SuggestionType;
    title: string;
    body: string;
    reason: string;
    dueDateISO: string | null;
  } | null;
};

const CONTENT_TYPES = Object.keys(ContextType);
const SUGGESTION_TYPES = Object.keys(SuggestionType);

function buildPrompt(params: {
  content: string;
  people: { id: string; name: string }[];
  openTasks: { id: string; title: string }[];
  today: string;
}) {
  const { content, people, openTasks, today } = params;
  return `You are the extraction step of a personal task-management system's Context Engine. Analyze ONE piece of raw context (a note, message, or conversation snippet) and extract structured, actionable signal from it. Never invent information that isn't in the text.

Today's date: ${today}

Known people (only use these names for mentionedPersonName, exact match, else null):
${people.length ? people.map((p) => `- ${p.name}`).join("\n") : "(none yet)"}

Existing open tasks (only use these ids for relatedExistingTaskId if the text is CLEARLY about the same task, else null):
${openTasks.length ? openTasks.map((t) => `- ${t.id}: ${t.title}`).join("\n") : "(none yet)"}

Context content:
"""
${content.slice(0, 4000)}
"""

Classify it and decide if it implies a real, specific commitment, promise, deadline, or blocker worth surfacing — as opposed to a casual idea or vague intention. Distinguish FACT (literally stated) from INFERENCE (your interpretation) — the "reason" field must quote or closely paraphrase the actual text, not assert a conclusion as fact.

Respond with ONLY a JSON object matching this shape:
{
  "contentType": one of [${CONTENT_TYPES.join(", ")}],
  "confidence": number 0-1 (confidence in this classification),
  "isActionable": boolean,
  "mentionedPersonName": string | null,
  "relatedExistingTaskId": string | null,
  "suggestion": null | {
    "type": one of [${SUGGESTION_TYPES.join(", ")}],
    "title": short actionable title (e.g. "Send proposal to Omar"),
    "body": one or two sentences explaining what's needed,
    "reason": cite the specific phrase from the content that justifies this,
    "dueDateISO": "YYYY-MM-DD" or null if no clear date is implied
  }
}

Only include "suggestion" if the content implies something genuinely actionable that isn't already covered by an existing task above. If it's just an observation or idea with no clear commitment, set suggestion to null.`;
}

export async function runExtractionPipeline(limit = 20) {
  const pending = await prisma.contextItem.findMany({
    where: { processed: false },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  if (pending.length === 0) return { processed: 0, suggestionsCreated: 0, skipped: 0 };

  const [people, openTasks] = await Promise.all([
    prisma.person.findMany({ select: { id: true, name: true } }),
    prisma.task.findMany({
      where: { status: { not: TaskStatus.COMPLETED } },
      select: { id: true, title: true },
    }),
  ]);

  let processed = 0;
  let suggestionsCreated = 0;
  let skipped = 0;

  for (const item of pending) {
    const prompt = buildPrompt({
      content: item.content,
      people,
      openTasks,
      today: new Date().toISOString().slice(0, 10),
    });

    const result = await extractJson<ExtractionResult>(prompt);
    if (!result) {
      skipped++;
      continue; // no AI configured — leave processed=false so it's retried once a key is set
    }

    const matchedPerson = result.mentionedPersonName
      ? people.find((p) => p.name.toLowerCase() === result.mentionedPersonName!.toLowerCase())
      : null;
    const matchedTask = result.relatedExistingTaskId
      ? openTasks.find((t) => t.id === result.relatedExistingTaskId)
      : null;

    const contentType = CONTENT_TYPES.includes(result.contentType) ? result.contentType : "NOTE";
    const confidence = Math.max(0, Math.min(1, result.confidence ?? 0.5));

    await prisma.contextItem.update({
      where: { id: item.id },
      data: {
        contentType: contentType as ContextType,
        confidence,
        relevance: result.isActionable ? Math.max(confidence, 0.6) : confidence * 0.6,
        personId: matchedPerson?.id ?? null,
        relatedTaskId: matchedTask?.id ?? null,
        processed: true,
      },
    });
    processed++;

    if (result.suggestion && confidence >= 0.4) {
      const alreadySuggested = await prisma.suggestion.findFirst({
        where: { relatedContextId: item.id },
      });
      if (!alreadySuggested) {
        const type = SUGGESTION_TYPES.includes(result.suggestion.type)
          ? (result.suggestion.type as SuggestionType)
          : SuggestionType.MISSING_TASK;

        await prisma.suggestion.create({
          data: {
            type,
            title: result.suggestion.title,
            body: result.suggestion.body,
            reason: result.suggestion.reason,
            confidence,
            relatedContextId: item.id,
            relatedPersonId: matchedPerson?.id ?? null,
            relatedTaskId: matchedTask?.id ?? null,
          },
        });
        suggestionsCreated++;
      }
    }
  }

  return { processed, suggestionsCreated, skipped };
}
