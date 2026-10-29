import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBearerToken } from "@/lib/sync-auth";
import { localCompleteSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  if (!verifyBearerToken(req, "AGENTS_TOKEN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = localCompleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { runId, agent: agentName, output, error } = parsed.data;

  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { agent: true },
  });
  if (!run || run.agent.name !== agentName || run.agent.kind !== "LOCAL") {
    return NextResponse.json({ error: "Run not found for this agent" }, { status: 404 });
  }
  if (run.status !== "RUNNING") {
    return NextResponse.json({ error: "Run is not in progress" }, { status: 409 });
  }

  const failed = Boolean(error);
  const now = new Date();
  await prisma.$transaction([
    prisma.agentRun.update({
      where: { id: runId },
      data: failed
        ? { status: "FAILED", error: error ?? "Unknown error", finishedAt: now }
        : { status: "DONE", output: output ?? "", finishedAt: now },
    }),
    prisma.agent.update({
      where: { id: run.agentId },
      data: { status: failed ? "BLOCKED" : "IDLE", lastSeenAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
