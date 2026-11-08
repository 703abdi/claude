"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { MorningBrief } from "@/lib/types";
import { dayKey } from "@/lib/day";

export default function BriefCard({
  brief,
  loaded,
  tz,
  todayKey,
  onGenerated,
}: {
  brief: MorningBrief | null;
  loaded: boolean;
  tz: string;
  todayKey: string;
  onGenerated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const stale = !brief || dayKey(new Date(brief.date), tz) < todayKey;

  async function generate() {
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/morning-brief/generate", { method: "POST" }).catch(() => null);
    if (!res?.ok) setFailed(true);
    setBusy(false);
    onGenerated();
  }

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  }

  return (
    <div className="card min-w-0 p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight">Morning brief</h2>
          <div className="mt-0.5 font-mono text-[12px] text-muted-2">
            {brief ? new Date(brief.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : " "}
          </div>
        </div>
        {brief?.hasAudio && !stale && (
          <button onClick={toggle} className="btn-ghost h-9 shrink-0 px-3 text-xs">
            <span className="w-3 text-center">{playing ? "❚❚" : "▶"}</span>
            <span className={`hub-wave flex h-3.5 items-end gap-[3px] text-accent ${playing ? "" : "opacity-50"}`}>
              {[0.1, 0.35, 0.2, 0.5, 0.15].map((d, i) => (
                <span key={i} style={{ height: "100%", animationDelay: `${d}s`, animationPlayState: playing ? "running" : "paused" }} />
              ))}
            </span>
            Listen
          </button>
        )}
      </div>
      {brief?.hasAudio && (
        <audio
          ref={audio}
          src={`/api/morning-brief/${brief.id}/audio`}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
      <div className="mt-3">
        {!loaded ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : stale ? (
          <div className="space-y-3">
            <p className="text-[15px] text-muted">
              {brief ? "This brief is from an earlier day." : "No brief yet."} It reads your tasks, calendar and notes, and costs one AI call.
            </p>
            <button onClick={generate} disabled={busy} className="btn-primary">
              {busy ? "Writing…" : "Generate today's brief"}
            </button>
            {failed && <p className="text-xs text-danger">Couldn&apos;t write the brief. Check the AI key in your env.</p>}
          </div>
        ) : (
          <>
            <p className="line-clamp-3 whitespace-pre-line text-[15px] leading-relaxed text-muted">{brief?.textContent}</p>
            <div className="mt-3 flex items-center justify-between text-xs">
              <Link href="/brief" className="font-semibold text-accent hover:underline">
                Read
              </Link>
              <button onClick={generate} disabled={busy} className="text-muted-2 hover:text-foreground disabled:opacity-50">
                {busy ? "Refreshing…" : "Regenerate"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
