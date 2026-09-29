import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { gatherMorningBriefContext } from "@/lib/morning-brief/gather";
import { generateMorningBriefText } from "@/lib/morning-brief/generate";
import { buildTranscriptSegments, totalDuration } from "@/lib/morning-brief/segments";
import { generateSpeech } from "@/lib/morning-brief/tts";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const ctx = await gatherMorningBriefContext();
  const { text } = await generateMorningBriefText(ctx);
  const segments = buildTranscriptSegments(text);
  const estimatedDuration = totalDuration(segments);

  let audioData: Buffer | null = null;
  let audioMimeType: string | null = null;
  let ttsStatus = "not_generated";
  let ttsError: string | null = null;

  const provider = process.env.TTS_PROVIDER || null;
  if (provider) {
    try {
      const speech = await generateSpeech(text, user?.voiceStyle ?? "neutral-professional");
      if (speech) {
        audioData = speech.buffer;
        audioMimeType = speech.mimeType;
        ttsStatus = "ready";
      }
    } catch (e) {
      ttsStatus = "failed";
      ttsError = e instanceof Error ? e.message : "Unknown TTS error";
    }
  }

  const brief = await prisma.morningBrief.create({
    data: {
      textContent: text,
      transcriptSegments: segments,
      audioData: audioData ? new Uint8Array(audioData) : undefined,
      audioMimeType,
      audioDuration: estimatedDuration,
      voiceStyle: user?.voiceStyle ?? "neutral-professional",
      ttsProvider: provider,
      ttsStatus,
      ttsError,
    },
  });

  return NextResponse.json({
    id: brief.id,
    date: brief.date,
    textContent: brief.textContent,
    transcriptSegments: brief.transcriptSegments,
    audioDuration: brief.audioDuration,
    hasAudio: !!audioData,
    voiceStyle: brief.voiceStyle,
    ttsStatus: brief.ttsStatus,
    ttsError: brief.ttsError,
    lastPlaybackPosition: brief.lastPlaybackPosition,
    createdAt: brief.createdAt,
  });
}
