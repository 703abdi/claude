import { prisma } from "@/lib/prisma";
import { ContextType, SuggestionStatus, TaskStatus } from "@prisma/client";

/**
 * Context retrieval — picks out the handful of ingested items that matter
 * *right now* out of everything the connectors have ever stored.
 *
 * The extraction pipeline (./extract.ts) looks at each ContextItem exactly
 * once, at ingest time, and then marks it processed forever. That leaves the
 * Context Database write-only from the assistant's point of view: the morning
 * brief, the detectors and the priority engine never consult it again. This
 * module is the read side.
 *
 * Scoring is deliberately deterministic (no LLM call) so the brief still gets
 * grounded context with no ANTHROPIC_API_KEY configured — spec §36/§66.
 */

const HALF_LIFE_DAYS = 14;

/** How much each kind of context is worth surfacing unprompted. */
const TYPE_WEIGHT: Record<ContextType, number> = {
  COMMITMENT: 1,
  PROMISE: 1,
  DEADLINE: 0.95,
  FOLLOW_UP: 0.9,
  DECISION: 0.8,
  TASK_CANDIDATE: 0.75,
  PROJECT_UPDATE: 0.6,
  MEETING: 0.5,
  IDEA: 0.35,
  OBSERVATION: 0.3,
  CONVERSATION: 0.25,
  NOTE: 0.25,
};

/** Types that represent something owed to someone, not just something noted. */
const OBLIGATION_TYPES: ContextType[] = [
  ContextType.COMMITMENT,
  ContextType.PROMISE,
  ContextType.FOLLOW_UP,
  ContextType.DEADLINE,
];

/** A commitment this old with nothing to show for it has gone quiet, not cold. */
const DANGLING_MIN_AGE_DAYS = 7;
const DANGLING_MAX_AGE_DAYS = 120;

function recencyFactor(timestamp: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - timestamp.getTime()) / 86400000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** One line, collapsed whitespace, enough to recognise the item by. */
export function snippet(content: string, max = 240): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export type RetrievedContext = {
  id: string;
  source: string;
  contentType: ContextType;
  timestamp: Date;
  ageDays: number;
  snippet: string;
  personName: string | null;
  relatedTaskTitle: string | null;
  score: number;
  /** Why this item scored where it did — shown to the model, and auditable. */
  why: string[];
};

export type ContextDigest = {
  /** The most relevant items overall, highest score first. */
  relevant: RetrievedContext[];
  /**
   * Obligations captured in context that never became a task and were never
   * accepted as a suggestion. These are the ones most likely to be genuinely
   * dropped, as opposed to merely old.
   */
  dangling: RetrievedContext[];
  /** Items ingested since the previous morning brief. */
  newSinceLastBrief: number;
  /** Total processed items in the Context Database. */
  totalProcessed: number;
};

type ContextRow = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(since: Date) {
  return prisma.contextItem.findMany({
    where: { processed: true, timestamp: { gte: since } },
    include: {
      person: { select: { name: true } },
      relatedTask: { select: { title: true, status: true } },
      suggestions: { select: { status: true } },
    },
    orderBy: { timestamp: "desc" },
    take: 400,
  });
}

function toRetrieved(row: ContextRow, score: number, why: string[], now: Date): RetrievedContext {
  return {
    id: row.id,
    source: row.source,
    contentType: row.contentType,
    timestamp: row.timestamp,
    ageDays: Math.floor((now.getTime() - row.timestamp.getTime()) / 86400000),
    snippet: snippet(row.content),
    personName: row.person?.name ?? null,
    relatedTaskTitle: row.relatedTask?.title ?? null,
    score: Math.round(score * 100) / 100,
    why,
  };
}

/**
 * Builds the context digest for a point in time.
 *
 * `activePeopleNames` / `activeTaskTitles` come from whatever is already live
 * in the task graph, so context that touches something currently in motion
 * outranks context that doesn't.
 */
export async function retrieveRelevantContext(params: {
  activePeopleNames?: string[];
  activeTaskTitles?: string[];
  limit?: number;
  now?: Date;
} = {}): Promise<ContextDigest> {
  const now = params.now ?? new Date();
  const limit = params.limit ?? 8;
  const lookback = new Date(now.getTime() - DANGLING_MAX_AGE_DAYS * 86400000);

  const activePeople = new Set((params.activePeopleNames ?? []).map((n) => n.toLowerCase()));
  const activeTitleWords = new Set(
    (params.activeTaskTitles ?? [])
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5)
  );

  const [rows, lastBrief, totalProcessed] = await Promise.all([
    loadRows(lookback),
    prisma.morningBrief.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.contextItem.count({ where: { processed: true } }),
  ]);

  const scored: { row: ContextRow; score: number; why: string[] }[] = [];

  for (const row of rows) {
    const why: string[] = [];
    const typeWeight = TYPE_WEIGHT[row.contentType] ?? 0.25;
    const recency = recencyFactor(row.timestamp, now);

    // Base: what kind of thing it is, faded by how long ago it was said,
    // nudged by the extractor's own relevance call.
    let score = typeWeight * recency * (0.5 + row.relevance / 2);

    if (OBLIGATION_TYPES.includes(row.contentType)) {
      why.push(`${row.contentType.toLowerCase().replace("_", " ")} captured from ${row.source.toLowerCase()}`);
    }

    if (row.relatedTask && row.relatedTask.status !== TaskStatus.COMPLETED) {
      score += 0.25;
      why.push(`tied to the open task "${row.relatedTask.title}"`);
    }

    if (row.person && activePeople.has(row.person.name.toLowerCase())) {
      score += 0.2;
      why.push(`${row.person.name} is already waiting on something`);
    }

    // Lexical overlap with live task titles: cheap topical relevance that
    // costs nothing and needs no embedding store.
    if (activeTitleWords.size > 0) {
      const words = new Set(
        row.content.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5)
      );
      let overlap = 0;
      for (const w of words) if (activeTitleWords.has(w)) overlap++;
      if (overlap > 0) {
        score += Math.min(overlap, 3) * 0.08;
        why.push(`overlaps ${overlap} term${overlap === 1 ? "" : "s"} with active work`);
      }
    }

    scored.push({ row, score, why });
  }

  scored.sort((a, b) => b.score - a.score);

  const relevant = scored.slice(0, limit).map((s) => toRetrieved(s.row, s.score, s.why, now));

  // Dangling obligations: an obligation old enough to have been acted on,
  // with no task attached and no suggestion ever accepted or edited off it.
  const dangling = scored
    .filter(({ row }) => {
      if (!OBLIGATION_TYPES.includes(row.contentType)) return false;
      const ageDays = (now.getTime() - row.timestamp.getTime()) / 86400000;
      if (ageDays < DANGLING_MIN_AGE_DAYS) return false;
      if (row.relatedTask && row.relatedTask.status !== TaskStatus.COMPLETED) return false;
      const actioned = row.suggestions.some(
        (s) => s.status === SuggestionStatus.ACCEPTED || s.status === SuggestionStatus.EDITED
      );
      if (actioned) return false;
      // Explicitly turned down — that's an answer, not a dropped ball.
      const refused = row.suggestions.some(
        (s) => s.status === SuggestionStatus.REJECTED || s.status === SuggestionStatus.DISMISSED
      );
      return !refused;
    })
    .slice(0, 5)
    .map(({ row, score, why }) =>
      toRetrieved(row, score, [...why, "never turned into a task"], now)
    );

  const newSinceLastBrief = lastBrief
    ? rows.filter((r) => r.createdAt > lastBrief.createdAt).length
    : rows.length;

  return { relevant, dangling, newSinceLastBrief, totalProcessed };
}
