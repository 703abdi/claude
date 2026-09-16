import { prisma } from "@/lib/prisma";
import type { RawContextInput } from "./types";

/**
 * Normalizes and stores raw content from any source adapter into the
 * Context Database. Idempotent per (source, sourceId): re-syncing an
 * unchanged Obsidian note or an already-seen ChatGPT conversation
 * updates the existing row instead of duplicating it — this is what
 * lets the Obsidian agent do incremental sync (spec §33).
 */
export async function ingestContextItems(items: RawContextInput[]) {
  const results = [];
  for (const item of items) {
    const existing = await prisma.contextItem.findFirst({
      where: { source: item.source, sourceId: item.sourceId },
    });

    if (existing && existing.content === item.content) {
      // Unchanged — nothing to re-ingest or re-process.
      results.push(existing);
      continue;
    }

    const saved = existing
      ? await prisma.contextItem.update({
          where: { id: existing.id },
          data: {
            content: item.content,
            sourceUrl: item.sourceUrl ?? null,
            timestamp: new Date(item.timestamp),
            project: item.project ?? null,
            processed: false, // content changed — needs re-extraction
          },
        })
      : await prisma.contextItem.create({
          data: {
            source: item.source,
            sourceId: item.sourceId,
            sourceUrl: item.sourceUrl ?? null,
            timestamp: new Date(item.timestamp),
            content: item.content,
            project: item.project ?? null,
          },
        });

    results.push(saved);
  }
  return results;
}
