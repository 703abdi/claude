"use client";

import { FormEvent, ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { ZONE_LABEL, type Zone } from "@/lib/agents/town";
import DestPanel from "@/components/agents/DestPanel";
import {
  buildCity,
  findPath,
  FLOOR_H,
  H,
  LANDMARK_PALETTE,
  N,
  PALETTES,
  project,
  roadNeighbors,
  W,
  ZONE_DOOR,
  type Cell,
  type Dest,
  type Pt,
} from "@/lib/agents/city";
import type { AgentView, AgentsResponse, RunView } from "@/lib/agents/types";

const KIND_COLOR: Record<AgentView["kind"], string> = {
  GROK: "#7c6df2",
  NVIDIA: "#76b900",
  CLAUDE: "#d97757",
  LOCAL: "#22c55e",
};

const WALK_MS = 600;

type Plan = { pos: Pt; path: Pt[]; target: Zone };

function slotOffset(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return { dx: (h % 13) - 6, dy: ((h >> 4) % 7) - 3 };
}

function Face({ points, fill }: { points: { x: number; y: number }[]; fill: string }) {
  return <polygon points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill={fill} stroke="rgba(0,0,0,0.25)" strokeWidth={0.6} />;
}

function Building({
  c,
  r,
  cell,
  selected,
  onClick,
}: {
  c: number;
  r: number;
  cell: Extract<Cell, { kind: "building" }>;
  selected: boolean;
  onClick: () => void;
}) {
  const pal = cell.tint ?? (cell.label ? LANDMARK_PALETTE : PALETTES[cell.palette]);
  const a = c + 0.12, b = c + 0.88, ra = r + 0.12, rb = r + 0.88;
  const h = cell.floors * FLOOR_H;
  const p = (x: number, y: number, lift = 0) => project(x, y, lift);
  const top = [p(a, ra, h), p(b, ra, h), p(b, rb, h), p(a, rb, h)];
  const front = [p(a, rb), p(b, rb), p(b, rb, h), p(a, rb, h)];
  const right = [p(b, ra), p(b, rb), p(b, rb, h), p(b, ra, h)];
  const label = cell.label ? p(c + 0.5, r + 0.5, h + 18) : null;
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }} className="town-building">
      <Face points={right} fill={pal.right} />
      <Face points={front} fill={pal.left} />
      <Face points={top} fill={pal.top} />
      {selected && <polygon points={top.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="#fff" strokeWidth={2} />}
      {label && (
        <text x={label.x} y={label.y} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f3f1ff" stroke="#0e1016" strokeWidth={3} paintOrder="stroke">
          {cell.label}
        </text>
      )}
    </g>
  );
}

function Park({ c, r }: { c: number; r: number }) {
  const g = project(c + 0.5, r + 0.5);
  const trees = [
    [-8, -4],
    [7, -2],
    [-2, 6],
  ];
  return (
    <g>
      <polygon
        points={[project(c, r), project(c + 1, r), project(c + 1, r + 1), project(c, r + 1)].map((q) => `${q.x},${q.y}`).join(" ")}
        fill="#3d6e47"
      />
      {trees.map(([dx, dy], i) => (
        <g key={i} transform={`translate(${g.x + dx}, ${g.y + dy})`}>
          <rect x={-1} y={0} width={2} height={5} fill="#5a3f2a" />
          <circle cx={0} cy={-2} r={5} fill="#2f8a4a" />
        </g>
      ))}
    </g>
  );
}

export default function CityView() {
  const city = useMemo(() => buildCity(), []);
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [positions, setPositions] = useState<Record<string, Pt>>({});
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [selectedDest, setSelectedDest] = useState<Dest | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const plans = useRef<Record<string, Plan>>({});

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

  useEffect(() => {
    if (!data) return;
    for (const a of data.agents) {
      const plan = plans.current[a.id];
      if (!plan) {
        plans.current[a.id] = { pos: { ...ZONE_DOOR.AWAY }, path: [], target: "AWAY" };
      }
      const p = plans.current[a.id];
      if (p.target !== a.zone) {
        p.target = a.zone;
        p.path = findPath(p.pos, ZONE_DOOR[a.zone]);
      }
    }
  }, [data]);

  useEffect(() => {
    const id = setInterval(() => {
      const next: Record<string, Pt> = {};
      for (const [agentId, plan] of Object.entries(plans.current)) {
        if (plan.path.length) {
          plan.pos = plan.path.shift()!;
        } else if (plan.target === "PARK") {
          const door = ZONE_DOOR.PARK;
          const options = roadNeighbors(plan.pos).filter(
            (q) => Math.abs(q.c - door.c) + Math.abs(q.r - door.r) <= 5
          );
          if (options.length && Math.random() < 0.6) {
            plan.pos = options[Math.floor(Math.random() * options.length)];
          }
        }
        next[agentId] = plan.pos;
      }
      setPositions(next);
    }, WALK_MS);
    return () => clearInterval(id);
  }, []);

  const agents = data?.agents ?? [];
  const runs = data?.runs ?? [];
  const selected = agents.find((a) => a.id === selectedAgent) ?? null;
  const selectedRun: RunView | null = selected ? runs.find((r) => r.agentId === selected.id) ?? null : null;
  const zoneAgents = selectedZone ? agents.filter((a) => a.zone === selectedZone) : [];

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selected || !prompt.trim()) return;
    setSending(true);
    await fetch(`/api/agents/${selected.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    setSending(false);
    setPrompt("");
  }

  const decorations: { depth: number; node: ReactElement }[] = [];
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      const cell = city[c][r];
      if (cell.kind === "building") {
        const zone = cell.zone ?? null;
        decorations.push({
          depth: c + r,
          node: (
            <Building
              key={`b${c}-${r}`}
              c={c}
              r={r}
              cell={cell}
              selected={(zone !== null && zone === selectedZone) || (cell.dest !== undefined && cell.dest === selectedDest)}
              onClick={() => {
                if (zone) {
                  setSelectedZone(zone);
                  setSelectedDest(null);
                }
                if (cell.dest) {
                  setSelectedDest(cell.dest);
                  setSelectedZone(null);
                }
                setSelectedAgent(null);
              }}
            />
          ),
        });
      } else if (cell.kind === "park") {
        decorations.push({ depth: c + r, node: <Park key={`p${c}-${r}`} c={c} r={r} /> });
      }
    }
  }
  decorations.sort((a, b) => a.depth - b.depth);

  const roadPts = [project(0, 0), project(N, 0), project(N, N), project(0, N)].map((q) => `${q.x},${q.y}`).join(" ");

  return (
    <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Town</h1>
          <p className="text-sm text-muted">Your agents walk the streets to the building that matches their work. Click anything.</p>
        </div>
        <span className="text-xs text-muted-2 font-mono shrink-0">{agents.length} agents</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 30%, #1c2236 0%, #0b0d14 70%)" }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Isometric town of agents">
            <polygon points={roadPts} fill="#0d1017" stroke="#3a4156" strokeWidth={2} />
            {Array.from({ length: N }).flatMap((_, c) =>
              Array.from({ length: N }).map((__, r) => {
                const cell = city[c][r];
                if (cell.kind !== "road") return null;
                const pts = [project(c, r), project(c + 1, r), project(c + 1, r + 1), project(c, r + 1)];
                return (
                  <polygon key={`r${c}-${r}`} points={pts.map((q) => `${q.x},${q.y}`).join(" ")} fill="#4a5165" stroke="#5d6680" strokeWidth={0.6} />
                );
              })
            )}
            {decorations.map((d) => d.node)}
            {agents.map((a) => {
              const pos = positions[a.id] ?? ZONE_DOOR.AWAY;
              const { dx, dy } = slotOffset(a.id);
              const p = project(pos.c + 0.5, pos.r + 0.5, 14);
              const working = a.status === "WORKING";
              const away = a.zone === "AWAY";
              const isSel = a.id === selectedAgent;
              return (
                <g
                  key={a.id}
                  style={{ transform: `translate(${p.x + dx}px, ${p.y + dy}px)`, transition: `transform ${WALK_MS}ms linear`, opacity: away ? 0.4 : 1 }}
                  onClick={() => {
                    setSelectedAgent(a.id);
                    setSelectedZone(null);
                    setSelectedDest(null);
                  }}
                >
                  <title>{`${a.name} · ${a.status.toLowerCase()} · ${ZONE_LABEL[a.zone]}`}</title>
                  <ellipse cx={0} cy={9} rx={8} ry={3} fill="rgba(0,0,0,0.4)" />
                  <g style={{ animation: working ? "town-bob-fast 0.7s ease-in-out infinite" : "town-bob-slow 2.6s ease-in-out infinite", cursor: "pointer" }}>
                    <circle r={isSel ? 11 : 9} fill={KIND_COLOR[a.kind]} stroke={isSel ? "#ffffff" : "#0e1016"} strokeWidth={2} />
                    <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                      {a.name.charAt(0).toUpperCase()}
                    </text>
                    <text y={-15} textAnchor="middle" fontSize={10} fontWeight={600} fill="#f3f1ff" stroke="#0e1016" strokeWidth={3} paintOrder="stroke">
                      {a.name}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="rounded-2xl border border-border bg-surface p-5 space-y-4 min-h-[260px]">
          {selected ? (
            <>
              <div>
                <div className="text-xs text-muted-2 font-mono uppercase">{selected.kind.toLowerCase()} agent</div>
                <div className="text-lg font-semibold">{selected.name}</div>
                <div className="text-xs text-muted font-mono">
                  {selected.status.toLowerCase()} · {ZONE_LABEL[selected.zone]}
                  {selected.model ? ` · ${selected.model}` : ""}
                </div>
              </div>
              {selectedRun ? (
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-2 font-mono mb-1">last run · {selectedRun.status.toLowerCase()}</div>
                  <p className="text-sm line-clamp-3">{selectedRun.prompt}</p>
                  {(selectedRun.output || selectedRun.error) && (
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-muted bg-surface-2 rounded-lg p-2 max-h-48 overflow-auto">
                      {selectedRun.error ?? selectedRun.output}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">No work yet.</p>
              )}
              <form onSubmit={send} className="space-y-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder={`Give ${selected.name} something to do`}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted-2 focus:outline-none focus:border-accent"
                />
                <button type="submit" disabled={sending || !prompt.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {sending ? "Sending…" : "Send work"}
                </button>
              </form>
            </>
          ) : selectedZone ? (
            <>
              <div>
                <div className="text-xs text-muted-2 font-mono uppercase">building</div>
                <div className="text-lg font-semibold">{ZONE_LABEL[selectedZone]}</div>
              </div>
              {zoneAgents.length === 0 ? (
                <p className="text-sm text-muted">Nobody is here right now.</p>
              ) : (
                <ul className="space-y-2">
                  {zoneAgents.map((a) => (
                    <li key={a.id}>
                      <button onClick={() => setSelectedAgent(a.id)} className="w-full text-left rounded-lg border border-border px-3 py-2 hover:border-accent">
                        <span className="text-sm font-medium">{a.name}</span>{" "}
                        <span className="text-xs text-muted-2 font-mono">{a.status.toLowerCase()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : selectedDest ? (
            <DestPanel dest={selectedDest} agents={agents} />
          ) : (
            <p className="text-sm text-muted">Click a building to see who is there, or click an agent to send it work.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
