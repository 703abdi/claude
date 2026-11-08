"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import CountUp from "@/components/fx/CountUp";
import Tilt from "@/components/fx/Tilt";
import { KIND_COLOR } from "@/components/town3d/kinds";
import { removeAgent } from "@/lib/agents/removeAgent";
import type { AgentKind, AgentView } from "@/lib/agents/types";
import { ago } from "./hub-ui";

type Connector = { id: string; name: string; group: string; configured: boolean; lastSyncAt?: string | null };

export function StatTile({
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

export function AgentRoster({ agents, onChanged }: { agents: AgentView[]; onChanged: () => void }) {
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
      const body = await res.json().catch(() => null);
      const modelError = body?.error?.fieldErrors?.model?.[0];
      setError(modelError ?? "Could not create agent. Names must be unique.");
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
          {kind !== "LOCAL" && <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model id, not your API key (blank = default)" className={inputClass} />}
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
              <button
                onClick={async () => {
                  if (await removeAgent(a)) onChanged();
                }}
                aria-label={`Remove ${a.name}`}
                title={`Remove ${a.name}`}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted-2 hover:bg-overdue/10 hover:text-overdue"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Connectors() {
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
