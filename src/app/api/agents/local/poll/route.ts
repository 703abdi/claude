import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBearerToken } from "@/lib/sync-auth";
import { localPollSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  if (!verifyBearerToken(req, "AGENTS_TOKEN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = localPollSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const agent = await prisma.agent.findUnique({ where: { name: parsed.data.agent } });
  if (!agent || agent.kind !== "LOCAL") {
    return NextResponse.json({ error: "Local agent not found" }, { status: 404 });
  }

  const now = new Date();
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      lastSeenAt: now,
      status: agent.status === "OFFLINE" ? "IDLE" : agent.status,
    },
  });

  if (agent.status === "WORKING") return NextResponse.json({ run: null });

  const next = await prisma.agentRun.findFirst({
    where: { agentId: agent.id, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!next) return NextResponse.json({ run: null });

  const claimed = await prisma.agentRun.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: now },
  });
  if (claimed.count === 0) return NextResponse.json({ run: null });

  await prisma.agent.update({ where: { id: agent.id }, data: { status: "WORKING" } });

  return NextResponse.json({
    run: { id: next.id, prompt: next.prompt, taskId: next.taskId },
  });
}
