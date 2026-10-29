"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentView } from "@/lib/agents/types";
import { TownWorld, type Pick, type Signals } from "@/components/town3d/world";

export default function TownCanvas({
  agents,
  selected,
  signals,
  onPick,
}: {
  agents: AgentView[];
  selected: Pick | null;
  signals: Signals;
  onPick: (pick: Pick | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const world = useRef<TownWorld | null>(null);
  const pickRef = useRef(onPick);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    pickRef.current = onPick;
  });

  useEffect(() => {
    if (!container.current) return;
    try {
      world.current = new TownWorld(container.current, (p) => pickRef.current(p));
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    return () => {
      world.current?.dispose();
      world.current = null;
    };
  }, []);

  useEffect(() => {
    world.current?.setAgents(agents);
  }, [agents]);

  useEffect(() => {
    world.current?.setSelected(selected);
  }, [selected]);

  useEffect(() => {
    world.current?.setSignals(signals);
  }, [signals]);

  return (
    <div ref={container} className="absolute inset-0 overflow-hidden">
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          3D view needs WebGL, which this browser has turned off.
        </div>
      )}
    </div>
  );
}
