"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import CountUp from "@/components/fx/CountUp";
import { KIND_COLOR } from "@/components/town3d/kinds";
import { removeAgent } from "@/lib/agents/removeAgent";
import type { AgentKind, AgentView } from "@/lib/agents/types";
import { ago } from "./hub-ui";

type Connector = { id: string; name: string; group: string; configured: boolean; lastSyncAt?: string | null };

export type NumberItem = { label: string; value: number | undefined; total?: number; href?: string; danger?: boolean };

const LG_COLS: Record<number, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/**
 * One card, one row of numbers, hairlines between. On phone the column count is picked so no
 * row ends in an empty grey cell: 4 items go 2x2, and with 5 the last cell spans the gap.
 */
export function NumbersStrip({ items }: { items: NumberItem[] }) {
  const n = items.length;
  const phoneCols = n === 4 ? 2 : 3;
  const leftover = n % phoneCols;
  const lastSpan = leftover === 1 ? "max-lg:col-span-3" : leftover === 2 ? "max-lg:col-span-2" : "";
  return (
    <div
      className={`grid gap-px overflow-hidden rounded-3xl border border-border bg-border ${phoneCols === 2 ? "grid-cols-2" : "grid-cols-3"} ${LG_COLS[n] ?? "lg:grid-cols-6"}`}
    >
      {items.map((it, i) => {
        const span = i === n - 1 ? lastSpan : "";
        const hot = it.danger && (it.value ?? 0) > 0;
        const body = (
          <div className="flex h-full flex-col justify-between gap-1 bg-surface-2 px-4 py-3.5 transition-colors hover:bg-surface-hover">
            <span className="eyebrow flex items-center gap-1.5">
              {it.label}
              {hot && <span className="blink-dot h-1.5 w-1.5 rounded-full bg-danger" />}
            </span>
            <span className={`font-mono text-[26px] font-bold leading-8 tabular-nums ${hot ? "text-danger" : "text-foreground"}`}>
              {it.value === undefined ? (
                <span className="text-muted-2">-</span>
              ) : (
                <>
                  <CountUp value={it.value} duration={0.6} />
                  {it.total !== undefined && <span className="text-[16px] text-muted-2">/{it.total}</span>}
                </>
              )}
            </span>
          </div>
        );
        return it.href ? (
          <Link key={it.label} href={it.href} className={`block ${span}`}>
            {body}
          </Link>
        ) : (
          <div key={it.label} className={span}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

const inputClass =
  "w-full rounded-[10px] border border-border-2 bg-surface-hover px-3 py-2 text-sm text-foreground placeholder:text-muted-2";

const STATUS_PILL: Record<AgentView["status"], string> = {
  IDLE: "text-ok bg-ok/10",
  WORKING: "text-accent bg-accent-soft",
  BLOCKED: "text-danger bg-danger/10",
  OFFLINE: "text-muted-2 bg-surface-hover",
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
    <div className="card min-w-0 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-bold">Agents</h2>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-accent hover:underline">
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
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" className="btn-primary">
            Create agent
          </button>
        </form>
      )}
      {agents.length === 0 ? (
        <p className="text-sm text-muted">No agents yet. Add one and it will walk into town.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {agents.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-hover text-sm font-bold"
                style={{ color: KIND_COLOR[a.kind] }}
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
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger/10"
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
    <div className="card min-w-0 p-5">
      <h2 className="text-[15px] font-bold mb-4">Connectors</h2>
      {!list ? (
        <p className="text-sm text-muted">Checking…</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-hover">
              <span className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${c.configured ? "bg-ok" : "bg-muted-2"}`} />
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
