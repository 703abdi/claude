import { prisma } from "./prisma";
import { SuggestionStatus, SuggestionType } from "@prisma/client";

/**
 * Feedback learning for the suggestion layer.
 *
 * Every accept / reject / dismiss is already recorded on Suggestion
 * (status + resolvedAt), and until now nothing read it back: the detectors
 * applied one flat 3-day cooldown whether a suggestion had been turned down
 * once or twelve times, and always at the same hardcoded confidence. This
 * module turns that history into two signals:
 *
 *   1. an exponential per-thread backoff, so a repeatedly refused suggestion
 *      gets quieter instead of returning on an identical schedule; and
 *   2. a per-type confidence multiplier, so detector families abdi actually
 *      acts on outrank the ones he never does.
 *
 * It is pure history arithmetic — no LLM call — so it keeps working with no
 * ANTHROPIC_API_KEY configured (spec §36/§66). It only ever makes the
 * assistant quieter or reorders what it leads with; it cannot invent a
 * suggestion or action one on its own.
 */

export const BASE_COOLDOWN_DAYS = 3;
export const MAX_COOLDOWN_DAYS = 45;

/** Below this many resolved suggestions a type has no opinion attached to it. */
const MIN_SAMPLE = 5;

/** Laplace prior: pulls a thin sample back toward neutral. */
const PRIOR_ACCEPTS = 2;
const PRIOR_TOTAL = 4;

const ACCEPTING: SuggestionStatus[] = [SuggestionStatus.ACCEPTED, SuggestionStatus.EDITED];
const REFUSING: SuggestionStatus[] = [SuggestionStatus.REJECTED, SuggestionStatus.DISMISSED];

export type TypeStats = {
  type: SuggestionType;
  accepted: number;
  refused: number;
  resolved: number;
  /** Raw observed rate, for display. NaN-free: 0 when nothing resolved. */
  acceptRate: number;
  /** Smoothed rate used for scoring. */
  smoothedRate: number;
  /** Multiplier applied to a detector's hardcoded confidence, 0.5–1.25. */
  confidenceMultiplier: number;
  /** True once there's enough evidence that abdi reliably refuses this type. */
  unwelcome: boolean;
};

export type FeedbackProfile = {
  byType: Map<SuggestionType, TypeStats>;
  /** Consecutive refusals since the last acceptance, keyed by suggestion thread. */
  refusalStreaks: Map<string, number>;
  totalResolved: number;
};

function threadKey(type: SuggestionType, taskId?: string | null, personId?: string | null) {
  return `${type}|${taskId ?? ""}|${personId ?? ""}`;
}

export async function loadFeedbackProfile(): Promise<FeedbackProfile> {
  const resolved = await prisma.suggestion.findMany({
    where: { status: { in: [...ACCEPTING, ...REFUSING] } },
    select: {
      type: true,
      status: true,
      relatedTaskId: true,
      relatedPersonId: true,
      resolvedAt: true,
      createdAt: true,
    },
    orderBy: [{ resolvedAt: "asc" }, { createdAt: "asc" }],
    take: 2000,
  });

  const counts = new Map<SuggestionType, { accepted: number; refused: number }>();
  const refusalStreaks = new Map<string, number>();

  for (const s of resolved) {
    const entry = counts.get(s.type) ?? { accepted: 0, refused: 0 };
    const key = threadKey(s.type, s.relatedTaskId, s.relatedPersonId);

    if (ACCEPTING.includes(s.status)) {
      entry.accepted++;
      refusalStreaks.set(key, 0); // an acceptance clears the thread's backoff
    } else {
      entry.refused++;
      refusalStreaks.set(key, (refusalStreaks.get(key) ?? 0) + 1);
    }
    counts.set(s.type, entry);
  }

  const byType = new Map<SuggestionType, TypeStats>();
  for (const type of Object.values(SuggestionType)) {
    const { accepted, refused } = counts.get(type) ?? { accepted: 0, refused: 0 };
    const resolvedCount = accepted + refused;
    const acceptRate = resolvedCount > 0 ? accepted / resolvedCount : 0;
    const smoothedRate = (accepted + PRIOR_ACCEPTS) / (resolvedCount + PRIOR_TOTAL);

    // Centred on the 0.5 prior: a type at the prior is left alone, a type
    // abdi always accepts gets a modest lift, one he always refuses is halved.
    const confidenceMultiplier = Math.max(0.5, Math.min(1.25, 0.5 + smoothedRate));

    byType.set(type, {
      type,
      accepted,
      refused,
      resolved: resolvedCount,
      acceptRate,
      smoothedRate,
      confidenceMultiplier,
      unwelcome: resolvedCount >= MIN_SAMPLE && acceptRate <= 0.15,
    });
  }

  return { byType, refusalStreaks, totalResolved: resolved.length };
}

/**
 * How long this specific suggestion thread should stay quiet after being
 * refused. Doubles per consecutive refusal — 3, 6, 12, 24, capped at 45 days.
 */
export function cooldownDaysFor(
  profile: FeedbackProfile,
  type: SuggestionType,
  taskId?: string | null,
  personId?: string | null
): number {
  const streak = profile.refusalStreaks.get(threadKey(type, taskId, personId)) ?? 0;
  if (streak <= 1) return BASE_COOLDOWN_DAYS;
  return Math.min(MAX_COOLDOWN_DAYS, BASE_COOLDOWN_DAYS * Math.pow(2, streak - 1));
}

/** Scales a detector's hardcoded confidence by how this type has landed before. */
export function adjustConfidence(
  profile: FeedbackProfile,
  type: SuggestionType,
  baseConfidence: number
): number {
  const stats = profile.byType.get(type);
  if (!stats || stats.resolved === 0) return baseConfidence;
  const adjusted = baseConfidence * stats.confidenceMultiplier;
  return Math.round(Math.max(0.05, Math.min(1, adjusted)) * 100) / 100;
}

/**
 * The bar a consistently-refused type has to clear before it surfaces at all.
 * Compared against the detector's OWN confidence, never against the weighted
 * value from adjustConfidence — applying the damping and then testing it
 * against this floor would compound the two and silence the type outright,
 * including for a genuinely overdue task.
 */
export function minimumConfidenceFor(profile: FeedbackProfile, type: SuggestionType): number {
  return profile.byType.get(type)?.unwelcome ? 0.8 : 0;
}

/**
 * Whether a suggestion is worth surfacing given how its type has landed
 * before. A type abdi reliably refuses is held to a higher bar, so only its
 * strongest cases get through — but a strong case always does: this never
 * silences a type permanently.
 */
export function passesFeedbackBar(
  profile: FeedbackProfile,
  type: SuggestionType,
  baseConfidence: number
): boolean {
  return baseConfidence >= minimumConfidenceFor(profile, type);
}

/** One line per type that has history, for logs and the brief's own context. */
export function describeFeedback(profile: FeedbackProfile): string[] {
  return [...profile.byType.values()]
    .filter((s) => s.resolved > 0)
    .sort((a, b) => b.resolved - a.resolved)
    .map(
      (s) =>
        `${s.type}: accepted ${s.accepted}/${s.resolved} (${Math.round(s.acceptRate * 100)}%)` +
        (s.unwelcome ? " — consistently refused, now held to a higher bar" : "")
    );
}
