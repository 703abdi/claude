"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentsResponse } from "@/lib/agents/types";

export function useAgents(intervalMs = 2500) {
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

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
    const id = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs, tick]);

  return { agents: data?.agents ?? [], runs: data?.runs ?? [], loaded: data !== null, refresh };
}
