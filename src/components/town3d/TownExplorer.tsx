"use client";

import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import DestPanel from "@/components/agents/DestPanel";
import { ZONE_LABEL } from "@/lib/agents/town";
import type { AgentView, RunView } from "@/lib/agents/types";
import type { TownSummary } from "@/lib/town-summary";
import type { Pick, Signals } from "@/components/town3d/world";

const TownCanvas = dynamic(() => import("@/components/town3d/TownCanvas"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Building the town…</div>,
});

const KIND_LABEL: Record<AgentView["kind"], string> = {
  GROK: "Grok",
  NVIDIA: "NVIDIA",
  CLAUDE: "Claude",
  LOCAL: "Local",
};

export default function TownExplorer({
  agents,
  runs,
  summary,
  heightClass = "h-[440px] md:h-[620px]",
  onWorkSent,
}: {
  agents: AgentView[];
  runs: RunView[];
  summary: TownSummary | null;
  heightClass?: string;
  onWorkSent?: () => void;
}) {
  const [selected, setSelected] = useState<Pick | null>(null);

  const signals: Signals = useMemo(
    () => ({
      overdue: summary?.tasks.overdue ?? 0,
      queued: agents.reduce((n, a) => n + a.queued, 0),
      working: agents.filter((a) => a.status === "WORKING").length,
    }),
    [summary, agents]
  );

  return (
    <div className={`relative ${heightClass} rounded-3xl overflow-hidden glass`} style={{ background: "radial-gradient(ellipse at 50% 35%, #1d2440 0%, #0b0d14 72%)" }}>
      <TownCanvas agents={agents} selected={selected} signals={signals} onPick={setSelected} />

      <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
        {(Object.keys(KIND_LABEL) as AgentView["kind"][]).map((k) => (
          <span key={k} className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] text-muted backdrop-blur">
            {KIND_LABEL[k]} · {agents.filter((a) => a.kind === k).length}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 text-[11px] text-muted-2">Drag to rotate · scroll to zoom · click anything</div>

      {selected && (
        <aside className="absolute right-3 top-3 bottom-3 w-[min(360px,calc(100%-24px))] overflow-y-auto rounded-2xl glass p-5 animate-slide-in-right">
          <button onClick={() => setSelected(null)} className="absolute right-3 top-3 text-lg leading-none text-muted-2 hover:text-foreground" aria-label="Close">
            ×
          </button>
          {selected.type === "agent" ? (
            <AgentPanel agent={agents.find((a) => a.id === selected.id) ?? null} runs={runs} onSent={onWorkSent} />
          ) : selected.type === "zone" ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-2 font-mono uppercase">building</div>
                <div className="text-lg font-semibold">{ZONE_LABEL[selected.zone]}</div>
              </div>
              {agents.filter((a) => a.zone === selected.zone).length === 0 ? (
                <p className="text-sm text-muted">Nobody is here right now.</p>
              ) : (
                <ul className="space-y-2">
                  {agents
                    .filter((a) => a.zone === selected.zone)
                    .map((a) => (
                      <li key={a.id}>
                        <button onClick={() => setSelected({ type: "agent", id: a.id })} className="w-full text-left rounded-lg border border-border px-3 py-2 hover:border-accent">
                          <span className="text-sm font-medium">{a.name}</span> <span className="text-xs text-muted-2 font-mono">{a.status.toLowerCase()}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : (
            <DestPanel dest={selected.dest} agents={agents} />
          )}
        </aside>
      )}
    </div>
  );
}

function AgentPanel({ agent, runs, onSent }: { agent: AgentView | null; runs: RunView[]; onSent?: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  if (!agent) return <p className="text-sm text-muted">This agent is gone.</p>;
  const mine = runs.filter((r) => r.agentId === agent.id).slice(0, 4);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!agent || !prompt.trim()) return;
    setSending(true);
    await fetch(`/api/agents/${agent.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    setSending(false);
    setPrompt("");
    onSent?.();
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-muted-2 font-mono uppercase">{agent.kind.toLowerCase()} agent</div>
        <div className="text-lg font-semibold">{agent.name}</div>
        <div className="text-xs text-muted font-mono">
          {agent.status.toLowerCase()} · {ZONE_LABEL[agent.zone]}
          {agent.model ? ` · ${agent.model}` : ""}
        </div>
      </div>
      <form onSubmit={send} className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={`Give ${agent.name} something to do`}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted-2 focus:outline-none focus:border-accent"
        />
        <button type="submit" disabled={sending || !prompt.trim()} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {sending ? "Sending…" : "Send work"}
        </button>
      </form>
      <div className="space-y-2">
        <div className="text-xs text-muted-2 font-mono uppercase">recent runs</div>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">No work yet.</p>
        ) : (
          mine.map((r) => (
            <details key={r.id} className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm">
                <span className="font-mono text-xs text-muted-2 mr-2">{r.status.toLowerCase()}</span>
                {r.prompt.length > 70 ? `${r.prompt.slice(0, 70)}…` : r.prompt}
              </summary>
              {(r.output || r.error) && (
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted bg-surface-2 rounded-lg p-2 max-h-56 overflow-auto">{r.error ?? r.output}</pre>
              )}
            </details>
          ))
        )}
      </div>
    </div>
  );
}
