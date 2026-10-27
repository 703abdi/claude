"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AgentKind, AgentsResponse, AgentView, RunStatus } from "@/lib/agents/types";

const AGENT_STATUS_CLASS: Record<AgentView["status"], string> = {
  IDLE: "text-stat-green border-stat-green/30 bg-stat-green/10",
  WORKING: "text-accent border-accent/30 bg-accent/10",
  BLOCKED: "text-overdue border-overdue/30 bg-overdue/10",
  OFFLINE: "text-muted-2 border-border bg-surface-2",
};

const RUN_STATUS_CLASS: Record<RunStatus, string> = {
  QUEUED: "text-stat-amber border-stat-amber/30 bg-stat-amber/10",
  RUNNING: "text-accent border-accent/30 bg-accent/10",
  DONE: "text-stat-green border-stat-green/30 bg-stat-green/10",
  FAILED: "text-overdue border-overdue/30 bg-overdue/10",
};

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:border-accent";

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function HubView() {
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AgentKind>("GROK");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [agentId, setAgentId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/agents", { cache: "no-store" });
        if (res.ok && alive) setData(await res.json());
      } catch {
        // keep last good snapshot
      }
    }
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tick]);

  const agents = data?.agents ?? [];
  const runs = data?.runs ?? [];
  const working = agents.filter((a) => a.status === "WORKING").length;
  const queued = agents.reduce((n, a) => n + a.queued, 0);
  const selectedId = agentId || agents[0]?.id || "";

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind,
        model: model || null,
        systemPrompt: systemPrompt || null,
      }),
    });
    if (!res.ok) {
      setCreateError("Could not create agent. Check the name is unique.");
      return;
    }
    setName("");
    setModel("");
    setSystemPrompt("");
    setShowCreate(false);
    refresh();
  }

  async function onDispatch(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !prompt.trim()) return;
    setSending(true);
    await fetch(`/api/agents/${selectedId}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    setSending(false);
    setPrompt("");
    refresh();
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Hub</h1>
        <p className="text-sm text-muted">Your agents, what they are doing, and the work you send them.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Agents" value={agents.length} />
        <Stat label="Working now" value={working} />
        <Stat label="Queued" value={queued} />
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold mb-3">Send work to an agent</h2>
          {agents.length === 0 ? (
            <p className="text-sm text-muted">Add an agent first.</p>
          ) : (
            <form onSubmit={onDispatch} className="space-y-3">
              <select value={selectedId} onChange={(e) => setAgentId(e.target.value)} className={inputClass}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.kind.toLowerCase()})
                  </option>
                ))}
              </select>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="What should they do?"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={sending || !prompt.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Agents</h2>
            <button onClick={() => setShowCreate((v) => !v)} className="text-xs text-accent hover:underline">
              {showCreate ? "Cancel" : "+ Add agent"}
            </button>
          </div>
          {showCreate && (
            <form onSubmit={onCreate} className="space-y-3 mb-4 pb-4 border-b border-border">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required className={inputClass} />
              <select value={kind} onChange={(e) => setKind(e.target.value as AgentKind)} className={inputClass}>
                <option value="GROK">Grok bot (xAI)</option>
                <option value="NVIDIA">NVIDIA NIM model (free build.nvidia.com key)</option>
                <option value="CLAUDE">Claude agent (Anthropic)</option>
                <option value="LOCAL">Local agent (runs on my machine)</option>
              </select>
              {kind !== "LOCAL" && (
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model id (blank = default for this provider)" className={inputClass} />
              )}
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                placeholder="Role / instructions (optional)"
                className={inputClass}
              />
              {createError && <p className="text-xs text-overdue">{createError}</p>}
              <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
                Create agent
              </button>
            </form>
          )}
          {agents.length === 0 ? (
            <p className="text-sm text-muted">No agents yet.</p>
          ) : (
            <ul className="space-y-2">
              {agents.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted-2 font-mono truncate">
                      {a.kind.toLowerCase()}
                      {a.model ? ` · ${a.model}` : ""} · seen {ago(a.lastSeenAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.queued > 0 && <span className="text-xs text-stat-amber font-mono">{a.queued} queued</span>}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${AGENT_STATUS_CLASS[a.status]}`}>
                      {a.status.toLowerCase()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold mb-3">Activity</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. Send an agent some work above.</p>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center gap-2 text-xs text-muted-2 font-mono mb-1">
                  <span className={`px-2 py-0.5 rounded-full border ${RUN_STATUS_CLASS[r.status]}`}>{r.status.toLowerCase()}</span>
                  <span className="text-foreground">{r.agentName}</span>
                  <span>· {ago(r.createdAt)}</span>
                </div>
                <p className="text-sm line-clamp-2">{r.prompt}</p>
                {(r.output || r.error) && (
                  <details className="mt-1">
                    <summary className="text-xs text-accent cursor-pointer">{r.error ? "Error" : "Output"}</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-muted bg-surface-2 rounded-lg p-3 max-h-72 overflow-auto">
                      {r.error ?? r.output}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-border p-5 text-xs text-muted space-y-1">
        <div className="font-semibold text-foreground text-sm mb-1">Connect a local agent</div>
        <p>
          Poll for work: <code className="font-mono">POST /api/agents/local/poll</code> with header{" "}
          <code className="font-mono">Authorization: Bearer $AGENTS_TOKEN</code> and body{" "}
          <code className="font-mono">{`{"agent":"<name>"}`}</code>. It returns a <code className="font-mono">run</code> or null.
        </p>
        <p>
          Report back: <code className="font-mono">POST /api/agents/local/complete</code> with{" "}
          <code className="font-mono">{`{"runId","agent","output"}`}</code> or <code className="font-mono">{`{"runId","agent","error"}`}</code>.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted-2">{label}</div>
      <div className="text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}
