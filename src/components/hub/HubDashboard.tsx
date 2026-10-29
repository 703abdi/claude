"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import CountUp from "@/components/fx/CountUp";
import Reveal from "@/components/fx/Reveal";
import Tilt from "@/components/fx/Tilt";
import TownExplorer from "@/components/town3d/TownExplorer";
import { KIND_COLOR } from "@/components/town3d/kinds";
import { useAgents } from "@/lib/agents/useAgents";
import type { AgentKind, AgentView, RunStatus, RunView } from "@/lib/agents/types";
import { useTownSummary } from "@/lib/useTownSummary";
import type { MorningBrief } from "@/lib/types";

type Connector = { id: string; name: string; group: string; configured: boolean; lastSyncAt?: string | null };

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function HubDashboard({ name }: { name: string }) {
  const now = useNow();
  const { agents, runs, refresh } = useAgents();
  const summary = useTownSummary();

  const working = agents.filter((a) => a.status === "WORKING").length;
  const queued = agents.reduce((n, a) => n + a.queued, 0);
  const metrics = summary?.metrics && "data" in summary.metrics ? summary.metrics.data : null;

  const statusLine = [
    `${working} of ${agents.length} agents working`,
    summary ? `${summary.tasks.overdue} overdue` : null,
    metrics ? `${metrics.overview.today} new leads today` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ticker = [
    `SYS ONLINE`,
    `AGENTS ${working}/${agents.length} ACTIVE`,
    `QUEUE ${queued}`,
    summary ? `TASKS ${summary.tasks.open} OPEN · ${summary.tasks.overdue} LATE` : "TASKS ···",
    metrics ? `LEADS ${metrics.overview.today} TODAY · ${metrics.overview.last7} THIS WEEK` : "ABDIFORM OFFLINE",
    summary?.calendar.items[0] ? `NEXT ${summary.calendar.items[0].title.toUpperCase()}` : "CALENDAR CLEAR",
  ];

  return (
    <div className="hub-bg relative min-h-full overflow-hidden">
      <div className="hud-grid" />
      <div className="relative z-10 px-4 md:px-8 py-6 max-w-[1400px] mx-auto space-y-6">
        <section className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <Reveal className="min-w-0">
            <div className="relative h-full overflow-hidden rounded-3xl glass glow-border hud-corners p-7 md:p-9 min-h-[260px] flex flex-col justify-between">
              <div className="hub-aurora" />
              <div className="hud-scan" />
              <HeroOrbit />
              <div className="relative">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.25em] text-[#22e1ff]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22e1ff] blink-dot shadow-[0_0_10px_#22e1ff]" />
                  abdi hub · command center
                </div>
                <h1 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">
                  {now ? greeting(now.getHours()) : "Welcome"}, <span className="neon-text">{name}</span>
                </h1>
                <p className="mt-3 text-sm md:text-base text-muted">{statusLine || "Loading your world…"}</p>
              </div>
              <div className="relative mt-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="font-mono text-4xl md:text-6xl font-bold tabular-nums tracking-tight drop-shadow-[0_0_24px_rgba(34,225,255,0.35)]">
                    {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                    <span className="ml-1 text-lg md:text-2xl text-[#22e1ff]/70">{now ? String(now.getSeconds()).padStart(2, "0") : "--"}</span>
                  </div>
                  <div className="text-sm text-muted mt-1">
                    {now ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href="/tasks" className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium backdrop-blur hover:border-[#22e1ff]/60 hover:shadow-[0_0_18px_rgba(34,225,255,0.35)] transition">
                    Tasks
                  </Link>
                  <Link href="/metrics" className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium backdrop-blur hover:border-[#9b7bff]/60 hover:shadow-[0_0_18px_rgba(155,123,255,0.35)] transition">
                    Metrics
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="min-w-0">
            <BriefCard />
          </Reveal>
        </section>

        <Reveal delay={0.15}>
          <div className="overflow-hidden rounded-full border border-white/10 bg-black/30 py-2 font-mono text-[11px] tracking-[0.2em] text-[#22e1ff]/80">
            <div className="ticker-track">
              {[...ticker, ...ticker].map((item, i) => (
                <span key={i} className="mx-6">
                  ◆ {item}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: "Open tasks", value: summary?.tasks.open, accent: "#9b7bff", href: "/tasks" },
            { label: "Overdue", value: summary?.tasks.overdue, accent: "#ff4d5e", href: "/tasks", hot: (summary?.tasks.overdue ?? 0) > 0 },
            { label: "Due today", value: summary?.tasks.dueToday, accent: "#ffb347", href: "/tasks" },
            {
              label: "Agents working",
              value: working,
              total: agents.length,
              accent: "#22e1ff",
              sub: queued ? `${queued} queued` : "queue clear",
            },
            {
              label: "Leads today",
              value: metrics ? metrics.overview.today : undefined,
              accent: "#60a5fa",
              href: "/metrics",
              sub: metrics ? `${metrics.overview.last7} this week` : "abdiform not connected",
              spark: metrics?.timeline.slice(-14).map((d) => d.count),
            },
            {
              label: "Form completion",
              value: metrics?.overview.completion != null ? Math.round(metrics.overview.completion * 100) : undefined,
              suffix: "%",
              accent: "#ff4fd8",
              href: "/metrics",
              sub: metrics ? `${Math.round(metrics.overview.winRate * 100)}% win rate` : undefined,
            },
          ].map((tile, i) => (
            <Reveal key={tile.label} delay={0.2 + i * 0.06} className="min-w-0">
              <StatTile {...tile} />
            </Reveal>
          ))}
        </section>

        <Reveal delay={0.1}>
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="font-mono text-[11px] tracking-[0.25em] text-[#22e1ff]">LIVE</span> Town
                </h2>
                <p className="text-sm text-muted">Every building is part of your OS. Agents walk to where their work is.</p>
              </div>
              <Link href="/town" className="shrink-0 whitespace-nowrap text-xs text-accent hover:underline">
                Full screen →
              </Link>
            </div>
            <TownExplorer agents={agents} runs={runs} summary={summary} onWorkSent={refresh} />
          </section>
        </Reveal>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_1fr_0.8fr]">
          <Reveal className="min-w-0">
            <AgentRoster agents={agents} onChanged={refresh} />
          </Reveal>
          <Reveal delay={0.08} className="min-w-0">
            <ActivityFeed runs={runs} />
          </Reveal>
          <Reveal delay={0.16} className="min-w-0">
            <Connectors />
          </Reveal>
        </section>
      </div>
    </div>
  );
}

function HeroOrbit() {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 opacity-60 md:opacity-80">
      <defs>
        <linearGradient id="orbitGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22e1ff" />
          <stop offset="100%" stopColor="#9b7bff" />
        </linearGradient>
      </defs>
      <g className="orbit-spin">
        <circle cx="100" cy="100" r="80" fill="none" stroke="url(#orbitGrad)" strokeWidth="0.6" strokeDasharray="2 6" />
        <circle cx="180" cy="100" r="3" fill="#22e1ff" />
      </g>
      <g className="orbit-spin-rev">
        <circle cx="100" cy="100" r="58" fill="none" stroke="#ff4fd8" strokeOpacity="0.5" strokeWidth="0.6" strokeDasharray="12 8" />
        <circle cx="42" cy="100" r="2.5" fill="#ff4fd8" />
      </g>
      <circle cx="100" cy="100" r="34" fill="none" stroke="#9b7bff" strokeOpacity="0.35" strokeWidth="0.6" />
    </svg>
  );
}

function BriefCard() {
  const [brief, setBrief] = useState<MorningBrief | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/morning-brief/latest", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => alive && setBrief(b))
      .catch(() => alive && setBrief(null));
    return () => {
      alive = false;
    };
  }, []);

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/morning-brief/generate", { method: "POST" });
    if (res.ok) setBrief(await res.json());
    setBusy(false);
  }

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  }

  return (
    <div className="relative h-full overflow-hidden rounded-3xl glass hud-corners p-6 md:p-7 flex flex-col">
      <div className="hud-scan" />
      <div className="relative flex items-center justify-between">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.25em] text-[#ff4fd8]">morning brief</div>
          <div className="text-sm text-muted-2 mt-1">
            {brief ? new Date(brief.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : " "}
          </div>
        </div>
        {brief?.hasAudio && (
          <button
            onClick={toggle}
            className="flex items-center gap-3 rounded-full bg-accent pl-3 pr-4 py-2 text-sm font-semibold text-white shadow-[0_0_30px_rgba(124,109,242,0.5)] hover:bg-accent-hover"
          >
            <span className="w-5 text-center">{playing ? "❚❚" : "▶"}</span>
            <span className={`hub-wave flex items-end gap-[3px] h-4 ${playing ? "" : "opacity-50"}`}>
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
        {brief === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : brief === null ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">No brief yet. Generate one from your tasks, calendar and notes.</p>
            <button onClick={generate} disabled={busy} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Writing…" : "Generate brief"}
            </button>
          </div>
        ) : (
          <p className="text-[15px] leading-relaxed text-foreground/90 line-clamp-[7] whitespace-pre-line">{brief.textContent}</p>
        )}
      </div>
      {brief && (
        <div className="relative mt-4 flex items-center justify-between text-xs">
          <Link href="/brief" className="text-accent hover:underline">
            Read the full brief →
          </Link>
          <button onClick={generate} disabled={busy} className="text-muted-2 hover:text-foreground disabled:opacity-50">
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  total,
  suffix,
  accent,
  sub,
  href,
  hot,
  spark,
}: {
  label: string;
  value: number | undefined;
  total?: number;
  suffix?: string;
  accent: string;
  sub?: string;
  href?: string;
  hot?: boolean;
  spark?: number[];
}) {
  const body = (
    <Tilt className="h-full rounded-2xl">
      <div
        className="relative h-full overflow-hidden rounded-2xl glass px-4 py-4"
        style={{ boxShadow: hot ? `0 0 0 1px ${accent}aa, 0 0 32px -6px ${accent}` : `inset 0 1px 0 ${accent}22` }}
      >
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl" style={{ background: `${accent}55` }} />
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
        <div className="relative flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.15em] text-muted">
          {label}
          {hot && <span className="h-1.5 w-1.5 rounded-full blink-dot" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />}
        </div>
        <div className="relative mt-1.5 text-3xl font-bold font-mono tabular-nums" style={{ textShadow: `0 0 18px ${accent}66` }}>
          {value === undefined ? (
            <span className="text-muted-2">—</span>
          ) : (
            <>
              <CountUp value={value} suffix={suffix} />
              {total !== undefined && <span className="text-lg text-muted-2">/{total}</span>}
            </>
          )}
        </div>
        {sub && <div className="relative mt-1 text-[11px] text-muted-2">{sub}</div>}
        {spark && spark.length > 1 && <Sparkline points={spark} color={accent} />}
      </div>
    </Tilt>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(1, ...points);
  const w = 100;
  const h = 24;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * w},${h - (p / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="relative mt-2 h-6 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:border-accent";

const STATUS_PILL: Record<AgentView["status"], string> = {
  IDLE: "text-stat-green bg-stat-green/10",
  WORKING: "text-accent bg-accent/15",
  BLOCKED: "text-overdue bg-overdue/10",
  OFFLINE: "text-muted-2 bg-surface-2",
};

function AgentRoster({ agents, onChanged }: { agents: AgentView[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AgentKind>("GROK");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, model: model || null, systemPrompt: systemPrompt || null }),
    });
    if (!res.ok) {
      setError("Could not create agent. Names must be unique.");
      return;
    }
    setName("");
    setModel("");
    setSystemPrompt("");
    setOpen(false);
    onChanged();
  }

  return (
    <div className="min-w-0 rounded-3xl glass p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">Agents</h2>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-accent hover:underline">
          {open ? "Cancel" : "+ Add agent"}
        </button>
      </div>
      {open && (
        <form onSubmit={create} className="space-y-2.5 mb-4 pb-4 border-b border-border">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required className={inputClass} />
          <select value={kind} onChange={(e) => setKind(e.target.value as AgentKind)} className={inputClass}>
            <option value="GROK">Grok bot (xAI)</option>
            <option value="NVIDIA">NVIDIA NIM (free build.nvidia.com key)</option>
            <option value="CLAUDE">Claude (Anthropic)</option>
            <option value="LOCAL">Local agent (runs on my machine)</option>
          </select>
          {kind !== "LOCAL" && <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model id (blank = provider default)" className={inputClass} />}
          <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={2} placeholder="Role / instructions (optional)" className={inputClass} />
          {error && <p className="text-xs text-overdue">{error}</p>}
          <button type="submit" className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white">
            Create agent
          </button>
        </form>
      )}
      {agents.length === 0 ? (
        <p className="text-sm text-muted">No agents yet. Add one and it will walk into town.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {agents.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface/60 px-3 py-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ background: KIND_COLOR[a.kind], boxShadow: a.status === "WORKING" ? `0 0 16px ${KIND_COLOR[a.kind]}` : undefined }}
              >
                {a.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.name}</div>
                <div className="text-[11px] text-muted-2 font-mono truncate">
                  {a.kind.toLowerCase()}
                  {a.model ? ` · ${a.model}` : ""}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[a.status]}`}>{a.status.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const RUN_DOT: Record<RunStatus, string> = {
  QUEUED: "#f5a623",
  RUNNING: "#a78bfa",
  DONE: "#22c55e",
  FAILED: "#ef4444",
};

function ActivityFeed({ runs }: { runs: RunView[] }) {
  return (
    <div className="min-w-0 rounded-3xl glass p-5">
      <h2 className="text-sm font-semibold mb-4">Activity</h2>
      {runs.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet. Click an agent in town and send it work.</p>
      ) : (
        <ol className="relative space-y-4 max-h-[420px] overflow-y-auto pr-1">
          {runs.slice(0, 20).map((r) => (
            <li key={r.id} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: RUN_DOT[r.status], boxShadow: `0 0 10px ${RUN_DOT[r.status]}` }} />
              <div className="min-w-0">
                <div className="text-[11px] text-muted-2 font-mono">
                  {r.agentName} · {r.status.toLowerCase()} · {ago(r.createdAt)}
                </div>
                <p className="text-sm line-clamp-2">{r.prompt}</p>
                {r.error && <p className="text-xs text-overdue line-clamp-1 mt-0.5">{r.error}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Connectors() {
  const [list, setList] = useState<Connector[] | null>(null);
  useEffect(() => {
    fetch("/api/connectors/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setList(j?.connectors ?? []))
      .catch(() => setList([]));
  }, []);

  return (
    <div className="min-w-0 rounded-3xl glass p-5">
      <h2 className="text-sm font-semibold mb-4">Connectors</h2>
      {!list ? (
        <p className="text-sm text-muted">Checking…</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-white/5">
              <span className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${c.configured ? "bg-stat-green shadow-[0_0_8px_#22c55e]" : "bg-muted-2"}`} />
                {c.name}
              </span>
              <span className="text-[11px] text-muted-2 font-mono">
                {c.configured ? (c.lastSyncAt ? `synced ${ago(c.lastSyncAt)}` : "connected") : "not set"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] text-muted-2 leading-relaxed">
        Connectors turn on when their keys are set in your deployment&apos;s environment. Settings live in Vercel, not here.
      </p>
    </div>
  );
}
