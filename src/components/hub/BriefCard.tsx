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
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl glass hud-corners p-5">
      <div className="hud-scan" />
      <div className="relative flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.25em] text-[#ff4fd8]">morning brief</div>
          <div className="mt-1 text-sm text-muted-2">
            {brief ? new Date(brief.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : " "}
          </div>
        </div>
        {brief?.hasAudio && !stale && (
          <button
            onClick={toggle}
            className="flex items-center gap-3 rounded-full bg-accent py-2 pl-3 pr-4 text-sm font-semibold text-white shadow-[0_0_30px_rgba(124,109,242,0.5)] hover:bg-accent-hover"
          >
            <span className="w-5 text-center">{playing ? "❚❚" : "▶"}</span>
            <span className={`hub-wave flex h-4 items-end gap-[3px] ${playing ? "" : "opacity-50"}`}>
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
      <div className="relative mt-4 flex-1">
        {!loaded ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : stale ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {brief ? "This brief is from an earlier day." : "No brief yet."} It reads your tasks, calendar and notes, and costs one AI call.
            </p>
            <button
              onClick={generate}
              disabled={busy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,109,242,0.45)] disabled:opacity-50"
            >
              {busy ? "Writing…" : "Generate today's brief"}
            </button>
            {failed && <p className="text-xs text-overdue">Couldn&apos;t write the brief. Check the AI key in your env.</p>}
            {brief && <p className="line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-muted-2">{brief.textContent}</p>}
          </div>
        ) : (
          <p className="line-clamp-[9] whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{brief?.textContent}</p>
        )}
      </div>
      {brief && (
        <div className="relative mt-4 flex items-center justify-between text-xs">
          <Link href="/brief" className="text-accent hover:underline">
            Read the full brief →
          </Link>
          {!stale && (
            <button onClick={generate} disabled={busy} className="text-muted-2 hover:text-foreground disabled:opacity-50">
              {busy ? "Refreshing…" : "Regenerate"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
