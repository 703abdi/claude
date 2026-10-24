"use client";

import { useEffect, useState } from "react";
import { ZONE_LABEL, type Zone } from "@/lib/agents/town";
import type { AgentView, AgentsResponse } from "@/lib/agents/types";

type MapZone = Exclude<Zone, "AWAY">;

const MAP_ZONES: Record<MapZone, { left: string; top: string; cx: number; cy: number; tint: string }> = {
  INBOX: { left: "2%", top: "4%", cx: 25, cy: 25, tint: "rgba(99,102,241,0.14)" },
  WORKSHOP: { left: "52%", top: "4%", cx: 75, cy: 25, tint: "rgba(34,197,94,0.14)" },
  DESK: { left: "2%", top: "54%", cx: 25, cy: 75, tint: "rgba(245,166,35,0.14)" },
  PARK: { left: "52%", top: "54%", cx: 75, cy: 75, tint: "rgba(20,184,166,0.14)" },
};

const SLOT_OFFSETS: [number, number][] = [
  [0, 0],
  [14, 0],
  [-14, 0],
  [0, 10],
  [0, -10],
];

function placeAgents(agents: AgentView[]) {
  const counts: Partial<Record<MapZone, number>> = {};
  return agents
    .filter((a): a is AgentView & { zone: MapZone } => a.zone !== "AWAY")
    .map((agent) => {
      const i = counts[agent.zone] ?? 0;
      counts[agent.zone] = i + 1;
      const zone = MAP_ZONES[agent.zone];
      const [dx, dy] = SLOT_OFFSETS[i % SLOT_OFFSETS.length];
      return { agent, x: zone.cx + dx, y: zone.cy + dy };
    });
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function TownView() {
  const [data, setData] = useState<AgentsResponse | null>(null);

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
    const id = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const agents = data?.agents ?? [];
  const placed = placeAgents(agents);
  const away = agents.filter((a) => a.zone === "AWAY");

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Town</h1>
          <p className="text-sm text-muted">
            Live view. Agents walk to the zone that matches what they are doing. Refreshes every 2.5s.
          </p>
        </div>
        <span className="text-xs text-muted-2 font-mono shrink-0">{agents.length} agents</span>
      </div>

      <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-surface" style={{ aspectRatio: "16 / 9" }}>
        {(Object.keys(MAP_ZONES) as MapZone[]).map((key) => {
          const z = MAP_ZONES[key];
          const inZone = agents.filter((a) => a.zone === key).length;
          return (
            <div
              key={key}
              className="absolute rounded-xl border border-border"
              style={{ left: z.left, top: z.top, width: "46%", height: "42%", background: z.tint }}
            >
              <div className="absolute top-2 left-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {ZONE_LABEL[key]}
              </div>
              <div className="absolute top-2 right-3 text-[11px] font-mono text-muted-2">{inZone}</div>
            </div>
          );
        })}

        {placed.map(({ agent, x, y }) => {
          const working = agent.status === "WORKING";
          const color = agent.kind === "GROK" ? "#7c6df2" : "#22c55e";
          return (
            <div
              key={agent.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transition: "left 1.4s ease-in-out, top 1.4s ease-in-out",
              }}
              title={`${agent.name} · ${agent.status}${agent.currentPrompt ? ` · ${agent.currentPrompt}` : ""}`}
            >
              <div
                className="flex flex-col items-center"
                style={{
                  animation: working ? "town-bob-fast 0.7s ease-in-out infinite" : "town-bob-slow 2.6s ease-in-out infinite",
                }}
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white border-2 border-background"
                  style={{
                    backgroundColor: color,
                    animation: working ? "town-ring 1.2s ease-out infinite" : undefined,
                  }}
                >
                  {agent.name.charAt(0).toUpperCase()}
                </div>
                <div className="mt-1 text-center leading-tight whitespace-nowrap">
                  <div className="text-[11px] font-semibold">{agent.name}</div>
                  <div className="text-[10px] text-muted-2 font-mono">{agent.status.toLowerCase()}</div>
                </div>
              </div>
            </div>
          );
        })}

        {agents.length === 0 && data && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            No agents yet. Add one in Hub.
          </div>
        )}
      </div>

      {away.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-2 mr-1">{ZONE_LABEL.AWAY}:</span>
          {away.map((a) => (
            <span key={a.id} className="text-xs px-2.5 py-1 rounded-full border border-border bg-surface text-muted">
              {a.name} <span className="font-mono text-muted-2">· {ago(a.lastSeenAt)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
