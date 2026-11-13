import { prisma } from "@/lib/prisma";

/** Latest brief without the audio bytes, plus a hasAudio flag. */
export async function getLatestBrief() {
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
  if (!brief) return null;
  const audio = await prisma.morningBrief.findUnique({
    where: { id: brief.id },
    select: { audioData: true },
  });
  return { ...brief, hasAudio: !!audio?.audioData };
}
