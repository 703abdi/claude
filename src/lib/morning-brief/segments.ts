export type TranscriptSegment = { start: number; end: number; text: string };

const WORDS_PER_MINUTE = 165;

/**
 * Splits brief text into sentence-level segments and estimates timing from
 * word count at a fixed speaking rate. Sentence-level sync is far more
 * reliable than word-level sync against a TTS engine we don't control —
 * see spec §29. Both the audio player's duration and this timing model
 * derive from the same estimate, so highlighting stays consistent even
 * though it isn't frame-perfect against the actual rendered audio.
 */
export function buildTranscriptSegments(text: string): TranscriptSegment[] {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    const duration = Math.max(1.2, (wordCount / WORDS_PER_MINUTE) * 60);
    segments.push({ start: cursor, end: cursor + duration, text: sentence });
    cursor += duration;
  }
  return segments;
}

export function totalDuration(segments: TranscriptSegment[]): number {
  return segments.length ? segments[segments.length - 1].end : 0;
}
