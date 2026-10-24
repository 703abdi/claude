import { prisma } from "@/lib/prisma";
import { callGrok, defaultGrokModel } from "@/lib/agents/grok";

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

export async function executeGrokRun(runId: string) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { agent: true },
  });
  if (!run || run.agent.kind !== "GROK" || run.status !== "QUEUED") return;

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
    const output = await callGrok({
      model: run.agent.model || defaultGrokModel(),
      systemPrompt: run.agent.systemPrompt,
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
