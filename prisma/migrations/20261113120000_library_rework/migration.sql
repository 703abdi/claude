-- Library rework: grouping (subject / source / topic), explanations, steps, variants, links and manual adds.
-- Additive only: old rows keep working with these columns null and addedBy 'sync'.
ALTER TABLE "LibraryDoc" ADD COLUMN "subject" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "source" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "topic" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "kind" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "summary" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "origin" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "purpose" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "steps" JSONB;
ALTER TABLE "LibraryDoc" ADD COLUMN "variants" JSONB;
ALTER TABLE "LibraryDoc" ADD COLUMN "url" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "addedBy" TEXT NOT NULL DEFAULT 'sync';

CREATE INDEX "LibraryDoc_subject_source_topic_idx" ON "LibraryDoc"("subject", "source", "topic");
