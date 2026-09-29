/*
  Warnings:

  - You are about to drop the column `audioUrl` on the `MorningBrief` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MorningBrief" DROP COLUMN "audioUrl",
ADD COLUMN     "audioData" BYTEA,
ADD COLUMN     "audioMimeType" TEXT,
ADD COLUMN     "ttsError" TEXT;
