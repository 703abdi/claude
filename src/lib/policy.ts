import { prisma } from "@/lib/prisma";
import { logSignal } from "@/lib/signals";

/** The knobs behind the ranking, out of the code and into a versioned row so the brain (and
 * Abdi) can turn them without a deploy. Every change is a new version with a reason;
 * rollback is "make the previous version live again". */

export type Ranked = { taskId: string; why: string };

export type Policy = {
  /** Dials per work day before the Dial card stops nagging. */
  dialTarget: number;
  /** Local hour after which being behind on dials counts. */
  dialStartHour: number;
  /** Show the Dial card at all. Off until the scoreboard fills itself, so it never lies. */
  dialNudge: boolean;
  /** Fathom action items pinned to Today per call. The rest stay unpinned. */
  fathomPinMax: number;
  /** Days someone can owe you before Do-this-now says nudge them. */
  nudgeAfterDays: number;
  /** Minutes before a call that Do-this-now switches to "prep for it". */
  eventLeadMin: number;
  /** Tomorrow's order for Today, written by the brain, with a one-line why each. */
  ranking: Ranked[];
  /** Local day (YYYY-MM-DD) the ranking is for. Ignored on any other day. */
  rankingDay: string | null;
};

export const POLICY_DEFAULTS: Policy = {
  dialTarget: 90,
  dialStartHour: 10,
  dialNudge: false,
  fathomPinMax: 2,
  nudgeAfterDays: 3,
  eventLeadMin: 45,
  ranking: [],
  rankingDay: null,
};

/** What the brain may change, and how far. Anything else it sends is dropped. */
export const POLICY_BOUNDS = {
  dialTarget: { min: 30, max: 150 },
  dialStartHour: { min: 8, max: 13 },
  fathomPinMax: { min: 0, max: 5 },
  nudgeAfterDays: { min: 1, max: 7 },
  eventLeadMin: { min: 15, max: 90 },
} as const;

type NumericKnob = keyof typeof POLICY_BOUNDS;
export const KNOB_LABEL: Record<NumericKnob | "dialNudge", string> = {
  dialTarget: "Dials per day",
  dialStartHour: "Dials count from (hour)",
  fathomPinMax: "Fathom items pinned per call",
  nudgeAfterDays: "Nudge after (days owed)",
  eventLeadMin: "Call prep lead (min)",
  dialNudge: "Show the Dial card",
};

type LivePolicy = { version: number; policy: Policy; reason: string | null; author: string; createdAt: string | null };
let cache: { at: number; value: LivePolicy } | null = null;
const CACHE_MS = 30_000;

export async function getPolicy(): Promise<LivePolicy> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const row = await prisma.policy.findFirst({ orderBy: { version: "desc" } });
  const policy = { ...POLICY_DEFAULTS, ...((row?.data as Partial<Policy> | null) ?? {}) };
  const value: LivePolicy = { version: row?.version ?? 0, policy, reason: row?.reason ?? null, author: row?.author ?? "default", createdAt: row?.createdAt.toISOString() ?? null };
  cache = { at: Date.now(), value };
  return value;
}

/** Clamp a proposed partial policy to the bounds; drop unknown keys. Returns only real changes. */
export function sanitizeChanges(current: Policy, proposed: Record<string, unknown>): Partial<Policy> {
  const out: Partial<Policy> = {};
  for (const key of Object.keys(POLICY_BOUNDS) as NumericKnob[]) {
    const v = proposed[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const b = POLICY_BOUNDS[key];
    const clamped = Math.round(Math.min(b.max, Math.max(b.min, v)));
    if (clamped !== current[key]) out[key] = clamped;
  }
  if (typeof proposed.dialNudge === "boolean" && proposed.dialNudge !== current.dialNudge) out.dialNudge = proposed.dialNudge;
  return out;
}

export async function savePolicy(changes: Partial<Policy>, reason: string, author: "abdi" | "brain") {
  const { version, policy } = await getPolicy();
  const next = { ...policy, ...changes };
  const row = await prisma.policy.create({ data: { version: version + 1, data: next, reason, author } });
  cache = null;
  await logSignal("policy.change", { source: author, ref: String(row.version), data: { changes, reason } });
  return { version: row.version, policy: next };
}

/** Make the version before the current one live again, as a new version. */
export async function rollbackPolicy() {
  const rows = await prisma.policy.findMany({ orderBy: { version: "desc" }, take: 2 });
  const prev = rows[1];
  const prevData = (prev?.data as Partial<Policy> | undefined) ?? {};
  const next = { ...POLICY_DEFAULTS, ...prevData };
  const version = (rows[0]?.version ?? 0) + 1;
  await prisma.policy.create({ data: { version, data: next, reason: `Rolled back to version ${prev?.version ?? 0}.`, author: "abdi" } });
  cache = null;
  await logSignal("policy.change", { source: "abdi", ref: String(version), data: { rollbackTo: prev?.version ?? 0 } });
  return { version, policy: next };
}

export async function policyHistory(limit = 10) {
  const rows = await prisma.policy.findMany({ orderBy: { version: "desc" }, take: limit });
  return rows.map((r) => ({ version: r.version, reason: r.reason, author: r.author, createdAt: r.createdAt.toISOString(), data: r.data as Partial<Policy> }));
}
