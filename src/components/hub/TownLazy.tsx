"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgentView, RunView } from "@/lib/agents/types";
import type { TownSummary } from "@/lib/town-summary";

// three.js lives behind this import. It only loads once the town is mounted.
const TownExplorer = dynamic(() => import("@/components/town3d/TownExplorer"), {
  ssr: false,
  loading: () => <div className="card flex h-[440px] items-center justify-center text-sm text-muted md:h-[620px]">Building the town…</div>,
});

const ZONES = [
  { zone: "INBOX", label: "Inbox", color: "var(--warn)" },
  { zone: "WORKSHOP", label: "Workshop", color: "var(--accent)" },
  { zone: "DESK", label: "Front desk", color: "var(--danger)" },
  { zone: "PARK", label: "Park", color: "var(--ok)" },
];

export default function TownLazy({
  agents,
  runs,
  summary,
  onWorkSent,
}: {
  agents: AgentView[];
  runs: RunView[];
  summary: TownSummary | null;
  onWorkSent: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Desktop: mount when scrolled into view. Phone: button only.
  useEffect(() => {
    if (mounted || !ref.current) return;
    if (!window.matchMedia("(min-width: 769px)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px" }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [mounted]);

  return (
    <section ref={ref} className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow eyebrow-accent">Live</div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.03em]">Town</h2>
          <p className="text-sm text-muted">Agents walk to where their work is.</p>
        </div>
        <Link href="/town" className="shrink-0 whitespace-nowrap text-xs font-semibold text-accent hover:underline">
          Full screen →
        </Link>
      </div>
      {mounted ? (
        <TownExplorer agents={agents} runs={runs} summary={summary} onWorkSent={onWorkSent} />
      ) : (
        <div className="card relative flex h-[220px] flex-col items-center justify-center gap-5 overflow-hidden md:h-[320px]">
          <div className="relative flex flex-wrap justify-center gap-2 px-4">
            {ZONES.map((z) => {
              const n = agents.filter((a) => a.zone === z.zone).length;
              return (
                <span key={z.label} className="inline-flex items-center gap-2 rounded-full border border-border-2 px-3 py-1 text-xs font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: z.color }} />
                  {z.label} <span className="font-mono font-bold text-foreground">{n}</span>
                </span>
              );
            })}
          </div>
          <button onClick={() => setMounted(true)} className="btn-primary">
            Open town
          </button>
        </div>
      )}
    </section>
  );
}
