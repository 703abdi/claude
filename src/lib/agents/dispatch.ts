import { prisma } from "@/lib/prisma";
import { runServerAgent, type ServerAgentKind } from "@/lib/agents/providers";
import { defaultModelFor } from "@/lib/agents/providers";
import { looksLikeApiKey } from "@/lib/agents/secrets";

type Outcome = { status: "DONE"; output: string } | { status: "FAILED"; error: string };

async function finishRun(runId: string, agentId: string, outcome: Outcome) {
  await prisma.$transaction([
    prisma.agentRun.update({
      where: { id: runId },
      data:
        outcome.status === "DONE"
          ? { status: "DONE", output: outcome.output, finishedAt: new Date() }
          : { status: "FAILED", error: outcome.error, finishedAt: new Date() },
    }),
    prisma.agent.update({
      where: { id: agentId },
      data: {
        status: outcome.status === "DONE" ? "IDLE" : "BLOCKED",
        lastSeenAt: new Date(),
      },
    }),
  ]);
}

// A run whose function was cut off never reaches finishRun and would sit in
// RUNNING forever, leaving its agent stuck at work. Anything running longer
// than the function could possibly live is marked failed instead.
const STALE_RUN_MS = 3 * 60_000;

export async function failStaleRuns() {
  const stale = await prisma.agentRun.findMany({
    // Local agents run on your own machine with no time limit, so only
    // server-run agents can be stale.
    where: {
      status: "RUNNING",
      startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) },
      agent: { kind: { not: "LOCAL" } },
    },
    select: { id: true, agentId: true },
  });
  for (const run of stale) {
    await finishRun(run.id, run.agentId, {
      status: "FAILED",
      error: "The server stopped this run before it finished. Try again, or give it a shorter task.",
    });
  }
}

export async function executeServerRun(runId: string) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { agent: true },
  });
  if (!run || run.agent.kind === "LOCAL" || run.status !== "QUEUED") return;

  await prisma.$transaction([
    prisma.agentRun.update({
      where: { id: runId },
      data: { status: "RUNNING", startedAt: new Date() },
    }),
    prisma.agent.update({
      where: { id: run.agentId },
      data: { status: "WORKING", lastSeenAt: new Date() },
    }),
  ]);

  try {
    const output = await runServerAgent({
      kind: run.agent.kind as ServerAgentKind,
      model: (!looksLikeApiKey(run.agent.model) && run.agent.model) || defaultModelFor(run.agent.kind) || "",
      system: run.agent.systemPrompt,
      prompt: run.prompt,
    });
    await finishRun(runId, run.agentId, { status: "DONE", output });
  } catch (err) {
    await finishRun(runId, run.agentId, {
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
