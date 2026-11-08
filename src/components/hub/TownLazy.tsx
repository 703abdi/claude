"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgentView, RunView } from "@/lib/agents/types";
import type { TownSummary } from "@/lib/town-summary";

// three.js lives behind this import. It only loads once the town is mounted.
const TownExplorer = dynamic(() => import("@/components/town3d/TownExplorer"), {
  ssr: false,
  loading: () => <div className="flex h-[440px] items-center justify-center rounded-3xl glass text-sm text-muted md:h-[620px]">Building the town…</div>,
});

const ZONES = [
  { zone: "INBOX", label: "Inbox", color: "#f5a623" },
  { zone: "WORKSHOP", label: "Workshop", color: "#9b7bff" },
  { zone: "DESK", label: "Front desk", color: "#ef4444" },
  { zone: "PARK", label: "Park", color: "#22c55e" },
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
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="font-mono text-[11px] tracking-[0.25em] text-[#22e1ff]">LIVE</span> Town
          </h2>
          <p className="text-sm text-muted">Agents walk to where their work is.</p>
        </div>
        <Link href="/town" className="shrink-0 whitespace-nowrap text-xs text-accent hover:underline">
          Full screen →
        </Link>
      </div>
      {mounted ? (
        <TownExplorer agents={agents} runs={runs} summary={summary} onWorkSent={onWorkSent} />
      ) : (
        <div
          className="relative flex h-[220px] flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl glass md:h-[320px]"
          style={{ background: "radial-gradient(ellipse at 50% 30%, #1d2440 0%, #0b0d14 72%)" }}
        >
          <div className="hud-grid opacity-60" />
          <div className="relative flex flex-wrap justify-center gap-2 px-4">
            {ZONES.map((z) => {
              const n = agents.filter((a) => a.zone === z.zone).length;
              return (
                <span
                  key={z.label}
                  className="rounded-full border px-3 py-1 text-xs font-medium backdrop-blur"
                  style={{ borderColor: `${z.color}88`, color: z.color, background: `${z.color}14` }}
                >
                  {z.label} · {n}
                </span>
              );
            })}
          </div>
          <button
            onClick={() => setMounted(true)}
            className="relative rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_rgba(124,109,242,0.5)] hover:bg-accent-hover"
          >
            Open town
          </button>
        </div>
      )}
    </section>
  );
}
