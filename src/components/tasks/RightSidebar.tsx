"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Task, Suggestion, CalendarEvent, MorningBrief } from "@/lib/types";
import { api } from "@/lib/api-client";

export default function RightSidebar({
  waitingTasks,
  suggestions,
  onSelectTask,
  onSuggestionResolved,
}: {
  waitingTasks: Task[];
  suggestions: Suggestion[];
  onSelectTask: (task: Task) => void;
  onSuggestionResolved: (id: string) => void;
}) {
  const [brief, setBrief] = useState<MorningBrief | null | undefined>(undefined);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null | undefined>(undefined);

  useEffect(() => {
    api.morningBrief.latest().then(setBrief).catch(() => setBrief(null));
    const today = new Date().toISOString().slice(0, 10);
    api.calendarEvents
      .list({ from: today })
      .then((events) => {
        const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
        setNextEvent(sorted[0] ?? null);
      })
      .catch(() => setNextEvent(null));
  }, []);

  const obsidianSuggestions = suggestions.filter((s) => s.relatedContext?.source === "OBSIDIAN");

  return (
    <div className="hidden xl:flex w-[300px] shrink-0 flex-col gap-4 border-l border-border sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-4">
      <BriefCard brief={brief} />

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-2 mb-2">Next on calendar</p>
        {nextEvent === undefined ? (
          <div className="h-14 rounded-xl border border-border bg-surface animate-pulse" />
        ) : nextEvent ? (
          <div className="rounded-xl border border-border bg-surface px-3.5 py-3">
            <p className="text-[11px] font-mono text-muted-2">
              {nextEvent.startTime ?? "All day"} · {new Date(nextEvent.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
            <p className="text-sm font-semibold mt-0.5 truncate">{nextEvent.title}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-2">Nothing on the calendar.</p>
        )}
      </div>

      {waitingTasks.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-2 mb-2">Waiting on</p>
          <div className="space-y-1.5">
            {waitingTasks.slice(0, 3).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5"
              >
                <button onClick={() => onSelectTask(t)} className="min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  {t.people[0] && <p className="text-[11px] text-muted-2 truncate">{t.people[0].name}</p>}
                </button>
                <button
                  onClick={() => onSelectTask(t)}
                  className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-stat-green/20 text-stat-green hover:bg-stat-green/30 transition-colors"
                >
                  Nudge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {obsidianSuggestions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">From Obsidian</p>
            <span className="text-[11px] font-mono text-muted-2">{obsidianSuggestions.length} new</span>
          </div>
          <div className="space-y-1.5">
            {obsidianSuggestions.slice(0, 4).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5">
                <p className="min-w-0 text-sm font-medium truncate">{s.title}</p>
                <button
                  onClick={async () => {
                    onSuggestionResolved(s.id);
                    await api.suggestions.resolve(s.id, "accept");
                  }}
                  className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-pink/20 text-pink hover:bg-pink/30 transition-colors"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BriefCard({ brief }: { brief: MorningBrief | null | undefined }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play();
    }
  }

  async function sendToPhone() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/brief`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  const durationLabel =
    brief?.audioDuration != null
      ? `${Math.floor(brief.audioDuration / 60)}:${String(Math.round(brief.audioDuration % 60)).padStart(2, "0")}`
      : null;

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/[0.08] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Morning brief</p>
        <span className="text-[10px] font-mono uppercase tracking-wide text-muted-2">Daily 06:00</span>
      </div>

      {brief === undefined ? (
        <div className="h-8 rounded bg-surface-2 animate-pulse" />
      ) : brief && brief.hasAudio ? (
        <>
          <audio
            ref={audioRef}
            src={`/api/morning-brief/${brief.id}/audio`}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shrink-0 hover:bg-accent-hover transition-colors"
            >
              {playing ? <PauseIcon className="w-4 h-4 text-white" /> : <PlayIcon className="w-4 h-4 text-white" />}
            </button>
            <div className="flex-1 h-6 flex items-center gap-[2px]">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-full bg-accent/40"
                  style={{ height: `${20 + ((i * 37) % 60)}%` }}
                />
              ))}
            </div>
            {durationLabel && <span className="text-[11px] font-mono text-muted-2 shrink-0">[{durationLabel}]</span>}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted">{brief ? "Ready — text only." : "Not generated yet today."}</p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <Link
          href="/brief"
          className="flex-1 text-center text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-foreground transition-colors"
        >
          Read transcript
        </Link>
        <button
          onClick={sendToPhone}
          className="flex-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-foreground transition-colors"
        >
          {copied ? "Link copied" : "Send to phone"}
        </button>
      </div>
    </div>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <rect x="3" y="2.5" width="3.5" height="11" rx="0.5" />
      <rect x="9.5" y="2.5" width="3.5" height="11" rx="0.5" />
    </svg>
  );
}
