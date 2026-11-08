"use client";

import { ago, useNow } from "./hub-ui";

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export default function HubHeader({
  name,
  updatedAt,
  changedAt,
  loading,
  error,
  onRefresh,
}: {
  name: string;
  updatedAt: number | null;
  changedAt: number;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}) {
  const now = useNow(1000);
  const d = now ? new Date(now) : null;
  const live = !error && updatedAt !== null;

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl glass px-4 py-3">
      <div className="hub-aurora opacity-60" />
      <div className="relative min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-lg font-bold tracking-tight md:text-xl">
            {d ? greeting(d.getHours()) : "Hey"}, <span className="neon-text">{name}</span>
          </h1>
          <span className="shrink-0 font-mono text-sm tabular-nums text-[#22e1ff]/90 drop-shadow-[0_0_10px_rgba(34,225,255,0.35)]">
            {d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--:--"}
          </span>
          <span className="hidden shrink-0 text-xs text-muted sm:inline">
            {d ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""}
          </span>
        </div>
      </div>
      <div className="relative flex shrink-0 items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted" title={error ? "Can't reach the server" : "Live"}>
          <span className="relative flex h-2 w-2">
            <span
              key={changedAt}
              className={`absolute inset-0 rounded-full ${changedAt ? "live-ring" : ""}`}
              style={{ background: live ? "#22e1ff" : "#ef4444" }}
            />
            <span
              className={`relative h-2 w-2 rounded-full ${live ? "blink-dot" : ""}`}
              style={{ background: live ? "#22e1ff" : "#ef4444", boxShadow: `0 0 8px ${live ? "#22e1ff" : "#ef4444"}` }}
            />
          </span>
          <span className="hidden sm:inline">{updatedAt && now ? `updated ${ago(updatedAt, now)}` : error ? "offline" : "syncing"}</span>
          <span className="sm:hidden">{updatedAt && now ? ago(updatedAt, now).replace(" ago", "") : ""}</span>
        </span>
        <button
          onClick={onRefresh}
          aria-label="Refresh"
          title="Refresh"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted transition hover:border-[#22e1ff]/50 hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" fill="none" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}>
            <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
