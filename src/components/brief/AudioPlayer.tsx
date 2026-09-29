"use client";

import { useEffect, useRef, useState } from "react";
import type { TranscriptSegment } from "@/lib/types";
import { api } from "@/lib/api-client";

function fmt(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AudioPlayer({
  briefId,
  audioSrc,
  segments,
  estimatedDuration,
  startPosition,
}: {
  briefId: string;
  audioSrc: string;
  segments: TranscriptSegment[];
  estimatedDuration: number;
  startPosition: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startPosition);
  const [duration, setDuration] = useState(estimatedDuration);
  const [activeIndex, setActiveIndex] = useState(-1);
  const lastSaved = useRef(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (startPosition > 0) audio.currentTime = startPosition;
  }, [startPosition]);

  function persistPosition(pos: number) {
    if (Math.abs(pos - lastSaved.current) < 3) return; // debounce writes
    lastSaved.current = pos;
    api.morningBrief.savePosition(briefId, pos).catch(() => {});
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    const idx = segments.findIndex((s) => audio.currentTime >= s.start && audio.currentTime < s.end);
    setActiveIndex(idx);
    persistPosition(audio.currentTime);
  }

  function onLoadedMetadata() {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) setDuration(audio.duration);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function seek(deltaOrTime: number, absolute = false) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = absolute
      ? deltaOrTime
      : Math.max(0, Math.min(duration, audio.currentTime + deltaOrTime));
  }

  function onScrub(e: React.ChangeEvent<HTMLInputElement>) {
    seek(Number(e.target.value), true);
  }

  return (
    <div>
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          if (audioRef.current) persistPosition(audioRef.current.currentTime);
        }}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        className="hidden"
      />

      <div className="border border-border bg-surface rounded-lg p-4">
        <div className="flex items-center justify-center gap-4 mb-3">
          <button
            onClick={() => seek(-10)}
            aria-label="Rewind 10 seconds"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-border text-muted hover:text-foreground hover:border-muted-2"
          >
            ⟲10
          </button>
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-foreground text-background font-bold"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            onClick={() => seek(10)}
            aria-label="Forward 10 seconds"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-border text-muted hover:text-foreground hover:border-muted-2"
          >
            10⟳
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-2">
          <span className="w-9 text-right">{fmt(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(currentTime, duration || 1)}
            onChange={onScrub}
            className="flex-1 accent-current"
          />
          <span className="w-9">{fmt(duration)}</span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {segments.map((seg, i) => (
          <p
            key={i}
            onClick={() => seek(seg.start, true)}
            className={`text-sm leading-relaxed cursor-pointer transition-colors rounded px-2 py-1 -mx-2 ${
              i === activeIndex ? "bg-surface-2 text-foreground font-medium" : "text-muted hover:text-foreground"
            }`}
          >
            {seg.text}
          </p>
        ))}
      </div>
    </div>
  );
}
