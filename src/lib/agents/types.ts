import type { Zone } from "@/lib/agents/town";

export type AgentKind = "GROK" | "LOCAL";
export type AgentStatus = "IDLE" | "WORKING" | "BLOCKED" | "OFFLINE";
export type RunStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export type AgentView = {
  id: string;
  name: string;
  kind: AgentKind;
  status: AgentStatus;
  model: string | null;
  lastSeenAt: string | null;
  queued: number;
  zone: Zone;
  currentPrompt: string | null;
};

export type RunView = {
  id: string;
  agentId: string;
  agentName: string;
  agentKind: AgentKind;
  prompt: string;
  status: RunStatus;
  output: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type AgentsResponse = { agents: AgentView[]; runs: RunView[] };
