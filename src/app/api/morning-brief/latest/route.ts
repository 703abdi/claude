import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const brief = await prisma.morningBrief.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      date: true,
      textContent: true,
      transcriptSegments: true,
      audioDuration: true,
      voiceStyle: true,
      ttsProvider: true,
      ttsStatus: true,
      ttsError: true,
      lastPlaybackPosition: true,
      createdAt: true,
    },
  });

  if (!brief) return NextResponse.json(null);

  const hasAudio = await prisma.morningBrief.findUnique({
    where: { id: brief.id },
    select: { audioData: true },
  });

  return NextResponse.json({ ...brief, hasAudio: !!hasAudio?.audioData });
}
