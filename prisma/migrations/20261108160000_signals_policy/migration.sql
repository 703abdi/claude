-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "source" TEXT,
    "ref" TEXT,
    "data" JSONB,
    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "reason" TEXT,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Signal_at_idx" ON "Signal"("at");
CREATE INDEX "Signal_kind_at_idx" ON "Signal"("kind", "at");
CREATE UNIQUE INDEX "Policy_version_key" ON "Policy"("version");
