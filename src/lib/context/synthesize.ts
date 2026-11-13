import { prisma } from "@/lib/prisma";
import { extractJson } from "@/lib/ai";
import { SuggestionStatus, SuggestionType, TaskStatus } from "@prisma/client";
import { retrieveRelevantContext, snippet } from "./retrieve";
import {
  adjustConfidence,
  loadFeedbackProfile,
  passesFeedbackBar,
} from "@/lib/suggestion-feedback";

/**
 * Cross-item synthesis.
 *
 * ./extract.ts reasons about exactly one ContextItem at a time and never
 * revisits it, so anything that only becomes visible across several items —
 * the same project circled in three notes over two weeks without a task ever
 * being made, a name that keeps recurring, a decision in one source that
 * contradicts an open task in another — is invisible to it. That is what the
 * MISSING_TASK / OPPORTUNITY / CROSS_SOURCE_LINK / PRIORITY_CHANGE suggestion
 * types were for, and nothing had ever produced one.
 *
 * This pass reads the recent context window *together* with the live task
 * graph and proposes only those four types. Like every other AI step it
 * returns cleanly when no ANTHROPIC_API_KEY is configured rather than
 * fabricating output (spec §36/§66), and it only ever creates PENDING
 * suggestions — it never touches a task.
 */

/** Only the types that genuinely need a cross-item view. */
const SYNTHESIS_TYPES = [
  SuggestionType.MISSING_TASK,
  SuggestionType.CROSS_SOURCE_LINK,
  SuggestionType.OPPORTUNITY,
  SuggestionType.PRIORITY_CHANGE,
] as const;

type SynthesisType = (typeof SYNTHESIS_TYPES)[number];

const MAX_PER_RUN = 5;
const MIN_CONTEXT_ITEMS = 3;
const CONTEXT_WINDOW = 25;

type SynthesisResult = {
  patterns: {
    type: string;
    title: string;
    body: string;
    reason: string;
    confidence: number;
    contextRefs: string[];
    taskRef: string | null;
  }[];
};

function normalizeTitle(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function runContextSynthesis(now: Date = new Date()) {
  const [activeTasks, people, pending] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: TaskStatus.COMPLETED } },
      select: { id: true, title: true, status: true, dueDate: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
    prisma.person.findMany({ select: { id: true, name: true } }),
    prisma.suggestion.findMany({
      where: { status: { in: [SuggestionStatus.PENDING, SuggestionStatus.SNOOZED] } },
      select: { title: true },
    }),
  ]);

  const waitingPeople = await prisma.task.findMany({
    where: { status: TaskStatus.WAITING },
    select: { people: { select: { person: { select: { name: true } } } } },
  });
  const activePeopleNames = [
    ...new Set(waitingPeople.flatMap((t) => t.people.map((tp) => tp.person.name))),
  ];

  const digest = await retrieveRelevantContext({
    activePeopleNames,
    activeTaskTitles: activeTasks.map((t) => t.title),
    limit: CONTEXT_WINDOW,
    now,
  });

  if (digest.relevant.length < MIN_CONTEXT_ITEMS) {
    return { created: 0, considered: digest.relevant.length, skipped: "not enough context" as const };
  }

  // Short, stable handles so the model can cite sources without us having to
  // trust it to echo a cuid back correctly.
  const contextByRef = new Map(digest.relevant.map((c, i) => [`C${i + 1}`, c]));
  const taskByRef = new Map(activeTasks.map((t, i) => [`T${i + 1}`, t]));

  const contextBlock = [...contextByRef.entries()]
    .map(
      ([ref, c]) =>
        `${ref} [${c.contentType}, ${c.source}, ${c.ageDays}d ago${
          c.personName ? `, mentions ${c.personName}` : ""
        }${c.relatedTaskTitle ? `, linked to task "${c.relatedTaskTitle}"` : ""}]: ${c.snippet}`
    )
    .join("\n");

  const taskBlock =
    [...taskByRef.entries()]
      .map(
        ([ref, t]) =>
          `${ref}: "${t.title}" (${t.status.toLowerCase().replace("_", " ")}${
            t.dueDate ? `, due ${t.dueDate.toDateString()}` : ""
          })`
      )
      .join("\n") || "(no open tasks)";

  const prompt = `You are the cross-item synthesis step of a personal task-management system's Context Engine, working for "abdi". Each of these context items has ALREADY been read individually. Your only job is to find what is visible when they are read TOGETHER and against the open task list — patterns no single item shows.

Today: ${now.toISOString().slice(0, 10)}

CONTEXT ITEMS (most relevant first):
${contextBlock}

OPEN TASKS:
${taskBlock}

KNOWN PEOPLE: ${people.map((p) => p.name).join(", ") || "(none)"}

ALREADY-OPEN SUGGESTIONS (do not repeat these):
${pending.map((p) => `- ${p.title}`).join("\n") || "(none)"}

Look specifically for:
- MISSING_TASK: a concrete commitment or piece of work that recurs across MULTIPLE context items and has no matching open task.
- CROSS_SOURCE_LINK: two or more items from different sources or different weeks that are clearly about the same thread, where connecting them changes what abdi should do.
- OPPORTUNITY: something the context shows is available or in motion that no open task is capturing.
- PRIORITY_CHANGE: context that materially contradicts the current status or urgency of a named open task.

Hard rules:
- A pattern must rest on at least TWO context items, cited by their C-refs. One item alone is not a pattern — the single-item step already handled those.
- "reason" must quote or closely paraphrase the actual wording of the cited items. Never assert an interpretation as if it were stated.
- Do not restate an existing open task or an already-open suggestion in different words.
- If nothing meets this bar, return an empty array. An empty answer is correct and expected — do not pad.
- Return at most ${MAX_PER_RUN}.

Respond with ONLY a JSON object:
{
  "patterns": [
    {
      "type": one of [${SYNTHESIS_TYPES.join(", ")}],
      "title": short actionable title,
      "body": one or two sentences on what this is and what it would take,
      "reason": the evidence, quoting the cited items,
      "confidence": number 0-1,
      "contextRefs": ["C1", "C4"],
      "taskRef": "T3" or null
    }
  ]
}`;

  const result = await extractJson<SynthesisResult>(prompt, 2048);
  if (!result || !Array.isArray(result.patterns)) {
    return { created: 0, considered: digest.relevant.length, skipped: "no ai result" as const };
  }

  const profile = await loadFeedbackProfile();
  const seenTitles = new Set(pending.map((p) => normalizeTitle(p.title)));
  let created = 0;

  for (const p of result.patterns.slice(0, MAX_PER_RUN)) {
    if (!p?.title || !p.body || !p.reason) continue;

    const type = (SYNTHESIS_TYPES as readonly string[]).includes(p.type)
      ? (p.type as SynthesisType)
      : SuggestionType.MISSING_TASK;

    // Enforce the two-item rule ourselves rather than trusting the model to.
    const refs = (p.contextRefs ?? []).filter((r) => contextByRef.has(r));
    if (refs.length < 2) continue;

    const key = normalizeTitle(p.title);
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);

    const base = Math.max(0, Math.min(1, p.confidence ?? 0.5));
    // A synthesised pattern is a guess about a guess, so it carries its own
    // floor on top of the type's feedback bar.
    if (base < 0.4 || !passesFeedbackBar(profile, type, base)) continue;
    const confidence = adjustConfidence(profile, type, base);

    const primary = contextByRef.get(refs[0])!;
    const task = p.taskRef ? taskByRef.get(p.taskRef) : null;

    await prisma.suggestion.create({
      data: {
        type,
        title: p.title,
        body: p.body,
        reason: `${p.reason} (across ${refs.length} context items)`,
        confidence,
        relatedContextId: primary.id,
        relatedTaskId: task?.id ?? null,
        relatedPersonId: null,
      },
    });
    created++;
  }

  return { created, considered: digest.relevant.length, skipped: null };
}

export { snippet };
