"use client";

import { useState } from "react";
import type { MorningBrief } from "@/lib/types";
import { api } from "@/lib/api-client";
import AudioPlayer from "./AudioPlayer";

export default function BriefView({ initialBrief }: { initialBrief: MorningBrief | null }) {
  const [brief, setBrief] = useState(initialBrief);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const fresh = await api.morningBrief.generate();
      setBrief(fresh);
    } finally {
      setGenerating(false);
    }
  }

  const isToday = brief && new Date(brief.createdAt).toDateString() === new Date().toDateString();

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold tracking-tight">Morning brief</h1>
        <button
          onClick={generate}
          disabled={generating}
          className="text-xs font-semibold bg-foreground text-background rounded-md px-3 py-1.5 disabled:opacity-40"
        >
          {generating ? "Generating..." : brief ? "Regenerate" : "Generate"}
        </button>
      </div>
      <p className="text-sm text-muted mb-6">
        {brief ? new Date(brief.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Nothing generated yet."}
        {brief && !isToday && " (not from today — regenerate for the latest picture)"}
      </p>

      {!brief && (
        <div className="border border-dashed border-border rounded-lg px-4 py-8 text-center">
          <p className="text-sm text-muted-2">
            Generate a brief from your current tasks, calendar, and open suggestions.
          </p>
        </div>
      )}

      {brief && brief.hasAudio && (
        <AudioPlayer
          briefId={brief.id}
          audioSrc={`/api/morning-brief/${brief.id}/audio`}
          segments={brief.transcriptSegments}
          estimatedDuration={brief.audioDuration ?? 0}
          startPosition={brief.lastPlaybackPosition}
        />
      )}

      {brief && !brief.hasAudio && (
        <div>
          {brief.ttsStatus === "failed" && (
            <p className="text-xs text-status-red mb-3">Audio generation failed: {brief.ttsError}</p>
          )}
          {brief.ttsStatus === "not_generated" && (
            <p className="text-xs text-muted-2 mb-3">
              No TTS provider configured — showing text only. Set TTS_PROVIDER (openai or elevenlabs) to enable
              audio.
            </p>
          )}
          <div className="border border-border bg-surface rounded-lg p-4 space-y-2">
            {brief.transcriptSegments.map((seg, i) => (
              <p key={i} className="text-sm leading-relaxed text-muted">
                {seg.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
