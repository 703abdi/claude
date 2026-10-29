"use client";

import { useEffect, useState } from "react";
import type { TownSummary } from "@/lib/town-summary";

export function useTownSummary(intervalMs = 30_000) {
  const [summary, setSummary] = useState<TownSummary | null>(null);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/town/summary", { cache: "no-store" });
        if (res.ok && alive) setSummary(await res.json());
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
  }, [intervalMs]);
  return summary;
}
