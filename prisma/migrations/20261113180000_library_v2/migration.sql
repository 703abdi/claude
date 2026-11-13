-- Library v2: short card fields (tldr, use-when, from line), a drawn visual, an example quote,
-- links and related items, and group labels for big topics. Additive only.
ALTER TABLE "LibraryDoc" ADD COLUMN "tldr" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "useWhen" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "fromLine" TEXT;
ALTER TABLE "LibraryDoc" ADD COLUMN "example" JSONB;
ALTER TABLE "LibraryDoc" ADD COLUMN "links" JSONB;
ALTER TABLE "LibraryDoc" ADD COLUMN "related" JSONB;
ALTER TABLE "LibraryDoc" ADD COLUMN "visual" JSONB;
ALTER TABLE "LibraryDoc" ADD COLUMN "groupLabel" TEXT;
