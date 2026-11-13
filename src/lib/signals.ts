import { prisma } from "@/lib/prisma";

/** The OS's memory of itself: what it showed, what Abdi did, what the sources and the brain
 * did. Append-only. Nothing learns without this, so every write path calls logSignal.
 * Fire-and-forget: a failed log never fails the action it describes. */

export type SignalKind =
  | "donow.shown"
  | "donow.acted"
  | "task.done"
  | "task.drop"
  | "task.add"
  | "score.add"
  | "score.set"
  | "feed.post"
  | "feed.task"
  | "feed.dismiss"
  | "sync"
  | "brain.run"
  | "policy.change";

export function logSignal(kind: SignalKind, opts: { source?: string | null; ref?: string | null; data?: Record<string, unknown> } = {}) {
  return prisma.signal
    .create({ data: { kind, source: opts.source ?? null, ref: opts.ref ?? null, data: opts.data ? JSON.parse(JSON.stringify(opts.data)) : undefined } })
    .then(() => true)
    .catch(() => false);
}

/** Compact view of the last N days for the brain: counts by kind, plus the recent rows. */
export async function signalDigest(days: number, limit = 300) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.signal.findMany({ where: { at: { gte: since } }, orderBy: { at: "desc" }, take: limit });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return {
    since: since.toISOString(),
    counts,
    recent: rows.map((r) => ({ at: r.at.toISOString(), kind: r.kind, source: r.source, ref: r.ref, data: r.data })),
  };
}
