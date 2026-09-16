import { prisma } from "./prisma";
import { TaskStatus } from "@prisma/client";
import { computeAiPriority } from "./priority-engine";
import { runSuggestionDetectors } from "./suggestion-detectors";
import { runExtractionPipeline } from "./context/extract";
import { gatherMorningBriefContext } from "./morning-brief/gather";
import { generateMorningBriefText } from "./morning-brief/generate";
import { buildTranscriptSegments, totalDuration } from "./morning-brief/segments";
import { generateSpeech } from "./morning-brief/tts";

/**
 * Recomputes aiPriorityScore/aiPriorityReason for every active task.
 * Purely a recommendation layer — never touches `position` or
 * `pinnedToday`, so a user's manual order and Today curation survive
 * every run untouched (spec §30/§48).
 */
export async function recomputePriorities() {
  const tasks = await prisma.task.findMany({
    where: { status: { not: TaskStatus.COMPLETED } },
    include: {
      category: true,
      people: true,
      blocks: { include: { blocked: { select: { status: true } } } },
    },
  });

  let updated = 0;
  for (const task of tasks) {
    const { score, reason } = computeAiPriority(task);
    if (task.aiPriorityScore !== score || task.aiPriorityReason !== reason) {
      await prisma.task.update({
        where: { id: task.id },
        data: { aiPriorityScore: score, aiPriorityReason: reason },
      });
      updated++;
    }
  }
  return { updated, total: tasks.length };
}

/**
 * The full daily refresh pipeline (spec §30-31). Safe to run repeatedly:
 * every step only adds/updates recommendation data or appends a new
 * MorningBrief row — it never deletes tasks or silently overwrites a
 * user's manual priorities.
 */
export async function runDailyRefresh() {
  const extraction = await runExtractionPipeline(50);
  const suggestions = await runSuggestionDetectors();
  const priorities = await recomputePriorities();

  const user = await prisma.user.findFirst();
  const ctx = await gatherMorningBriefContext();
  const { text } = await generateMorningBriefText(ctx);
  const segments = buildTranscriptSegments(text);
  const estimatedDuration = totalDuration(segments);

  let audioData: Uint8Array<ArrayBuffer> | undefined;
  let audioMimeType: string | null = null;
  let ttsStatus = "not_generated";
  let ttsError: string | null = null;

  const provider = process.env.TTS_PROVIDER || null;
  if (provider) {
    try {
      const speech = await generateSpeech(text, user?.voiceStyle ?? "neutral-professional");
      if (speech) {
        audioData = Uint8Array.from(speech.buffer);
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
      audioData,
      audioMimeType,
      audioDuration: estimatedDuration,
      voiceStyle: user?.voiceStyle ?? "neutral-professional",
      ttsProvider: provider,
      ttsStatus,
      ttsError,
    },
    select: { id: true },
  });

  return { extraction, suggestions, priorities, briefId: brief.id };
}
