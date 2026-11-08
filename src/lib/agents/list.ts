import { prisma } from "@/lib/prisma";
import { zoneFor } from "@/lib/agents/town";
import { defaultModelFor } from "@/lib/agents/providers";
import { looksLikeApiKey } from "@/lib/agents/secrets";
import { failStaleRuns } from "@/lib/agents/dispatch";
import type { AgentsResponse } from "@/lib/agents/types";

/** Agents with their zone + the latest runs. Shared by GET /api/agents and GET /api/hub. */
export async function listAgents(): Promise<AgentsResponse> {
  await failStaleRuns();
  const [agents, queuedGroups, recentRuns] = await Promise.all([
    prisma.agent.findMany({
      orderBy: { createdAt: "asc" },
      include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.agentRun.groupBy({
      by: ["agentId"],
      where: { status: "QUEUED" },
      _count: { _all: true },
    }),
    prisma.agentRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { agent: { select: { name: true, kind: true } } },
    }),
  ]);

  const queuedByAgent = new Map(queuedGroups.map((g) => [g.agentId, g._count._all]));

  return {
    agents: agents.map((a) => {
      const queued = queuedByAgent.get(a.id) ?? 0;
      const lastRun = a.runs[0] ?? null;
      const active = lastRun && (lastRun.status === "RUNNING" || lastRun.status === "QUEUED");
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        status: a.status,
        // Never echo a key someone pasted into the model field.
        model: looksLikeApiKey(a.model) ? defaultModelFor(a.kind) : a.model,
        lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
        queued,
        zone: zoneFor({
          status: a.status,
          queued,
          lastRunFailed: lastRun?.status === "FAILED",
        }),
        currentPrompt: active ? lastRun.prompt : null,
        currentTaskId: active ? lastRun.taskId : null,
      };
    }),
    runs: recentRuns.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      agentName: r.agent.name,
      agentKind: r.agent.kind,
      prompt: r.prompt,
      status: r.status,
      output: r.output,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  };
}
