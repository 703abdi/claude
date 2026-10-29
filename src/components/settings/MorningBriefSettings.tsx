"use client";

import { useState } from "react";

const VOICE_STYLES = [
  { id: "neutral-professional", label: "Neutral professional" },
  { id: "calm-british", label: "Calm British assistant" },
  { id: "deep-cinematic", label: "Deep, cinematic" },
  { id: "warm-conversational", label: "Warm and conversational" },
];

export default function MorningBriefSettings({
  initial,
  ttsConfigured,
}: {
  initial: { morningBriefTime: string; timezone: string; voiceStyle: string };
  ttsConfigured: boolean;
}) {
  const [time, setTime] = useState(initial.morningBriefTime);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [voiceStyle, setVoiceStyle] = useState(initial.voiceStyle);
  const [saved, setSaved] = useState(false);

  async function save() {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ morningBriefTime: time, timezone, voiceStyle }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-muted-2 mb-1">Brief time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={save}
            className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-muted-2 mb-1">Timezone (IANA)</span>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            onBlur={save}
            className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
          />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs text-muted-2 mb-1">Voice style</span>
        <select
          value={voiceStyle}
          onChange={(e) => {
            setVoiceStyle(e.target.value);
          }}
          onBlur={save}
          className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm outline-none"
        >
          {VOICE_STYLES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-2">
        {ttsConfigured
          ? "Audio generation is configured."
          : "No TTS provider configured — briefs will be text-only until TTS_PROVIDER and an API key are set."}
      </p>
      {saved && <p className="text-xs text-status-green">Saved.</p>}
    </div>
  );
}
