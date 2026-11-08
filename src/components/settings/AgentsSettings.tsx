"use client";

import { AgentRoster } from "@/components/hub/HubExtras";
import { useAgents } from "@/lib/agents/useAgents";

/** The agent roster, moved here from the Hub. */
export default function AgentsSettings() {
  const { agents, refresh } = useAgents(10_000);
  return (
    <AgentRoster agents={agents} onChanged={refresh} />
  );
}
