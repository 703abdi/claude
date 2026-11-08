"use client";

import { AgentRoster, Connectors } from "@/components/hub/HubExtras";
import { useAgents } from "@/lib/agents/useAgents";

/** The agent roster and connector list, moved here from the Hub. */
export default function AgentsSettings() {
  const { agents, refresh } = useAgents(10_000);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AgentRoster agents={agents} onChanged={refresh} />
      <Connectors />
    </div>
  );
}
