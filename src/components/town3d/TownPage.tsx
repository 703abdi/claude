"use client";

import TownExplorer from "@/components/town3d/TownExplorer";
import { useAgents } from "@/lib/agents/useAgents";
import { useTownSummary } from "@/lib/useTownSummary";

export default function TownPage() {
  const { agents, runs, refresh } = useAgents();
  const summary = useTownSummary();
  return (
    <div className="hub-bg px-3 md:px-6 py-4">
      <TownExplorer agents={agents} runs={runs} summary={summary} heightClass="h-[calc(100vh-7rem)] min-h-[520px]" onWorkSent={refresh} />
    </div>
  );
}
