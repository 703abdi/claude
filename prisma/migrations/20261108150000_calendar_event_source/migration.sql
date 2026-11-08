-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "source" TEXT,
ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_externalId_key" ON "CalendarEvent"("externalId");
