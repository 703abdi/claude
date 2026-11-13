-- Jarvis v2: notes, searchable memory, the action log (for Undo) and proactive nudges.
CREATE TABLE "Note" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Note_updatedAt_idx" ON "Note"("updatedAt");

CREATE TABLE "MemoryDoc" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "chunk" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "url" TEXT,
  "date" TIMESTAMP(3),
  "hash" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("body", ''))) STORED,
  CONSTRAINT "MemoryDoc_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemoryDoc_source_externalId_chunk_key" ON "MemoryDoc"("source", "externalId", "chunk");
CREATE INDEX "MemoryDoc_source_externalId_idx" ON "MemoryDoc"("source", "externalId");
CREATE INDEX "MemoryDoc_tsv_idx" ON "MemoryDoc" USING GIN ("tsv");

CREATE TABLE "JarvisAction" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "undo" JSONB,
  "undoneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JarvisAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JarvisAction_createdAt_idx" ON "JarvisAction"("createdAt");

CREATE TABLE "JarvisNudge" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "url" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pushedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  CONSTRAINT "JarvisNudge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JarvisNudge_key_key" ON "JarvisNudge"("key");
CREATE INDEX "JarvisNudge_dismissedAt_createdAt_idx" ON "JarvisNudge"("dismissedAt", "createdAt");
