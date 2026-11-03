import { prisma } from "@/lib/prisma";
import BriefView from "@/components/brief/BriefView";
import type { MorningBrief } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BriefPage() {
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
  const hasAudio = brief
    ? !!(await prisma.morningBrief.findUnique({ where: { id: brief.id }, select: { audioData: true } }))?.audioData
    : false;

  const initialBrief: MorningBrief | null = brief
    ? JSON.parse(JSON.stringify({ ...brief, hasAudio }))
    : null;

  return <BriefView initialBrief={initialBrief} />;
}
