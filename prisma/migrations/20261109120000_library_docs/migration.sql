-- Library: markdown notes pushed from the Obsidian vault (SOPs first), read in the app.
CREATE TABLE "LibraryDoc" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'SOPs',
    "order" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "mtime" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LibraryDoc_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "LibraryDoc_folder_order_idx" ON "LibraryDoc"("folder", "order");
