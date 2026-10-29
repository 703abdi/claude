import type { ContextSourceType } from "@prisma/client";

/**
 * A single piece of raw content from an external source, before it has
 * been normalized into the Context Database. Every adapter (Obsidian,
 * ChatGPT, future sources) produces items in this shape so the ingestion
 * and extraction pipeline stays source-agnostic.
 */
export type RawContextInput = {
  source: ContextSourceType;
  sourceId: string; // stable id within the source (file path, conversation id, ...)
  sourceUrl?: string | null;
  timestamp: string; // ISO — when the underlying content was authored/modified
  content: string;
  project?: string | null;
};

/**
 * Conceptual interface every ContextSource adapter implements. Obsidian
 * and ChatGPT don't push data through a running adapter instance in this
 * codebase (there's no long-lived server process reading a local vault or
 * OpenAI account) — instead each is an authenticated HTTP endpoint that
 * receives RawContextInput batches shaped this way. This type documents
 * the contract so a future adapter (e.g. a native integration that DOES
 * poll an API) can be added without changing the ingestion/extraction
 * pipeline.
 */
export interface ContextSourceAdapter {
  readonly source: ContextSourceType;
  fetchNewContext(since?: Date): Promise<RawContextInput[]>;
}
