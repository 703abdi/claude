import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentCreateSchema } from "@/lib/validation";
import { zoneFor } from "@/lib/agents/town";
import { defaultModelFor } from "@/lib/agents/providers";

export async function GET() {
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

  return NextResponse.json({
    agents: agents.map((a) => {
      const queued = queuedByAgent.get(a.id) ?? 0;
      const lastRun = a.runs[0] ?? null;
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        status: a.status,
        model: a.model,
        lastSeenAt: a.lastSeenAt,
        queued,
        zone: zoneFor({
          status: a.status,
          queued,
          lastRunFailed: lastRun?.status === "FAILED",
        }),
        currentPrompt:
          lastRun && (lastRun.status === "RUNNING" || lastRun.status === "QUEUED") ? lastRun.prompt : null,
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
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = agentCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const agent = await prisma.agent.create({
    data: {
      name: data.name,
      kind: data.kind,
      model: data.kind === "LOCAL" ? null : data.model || defaultModelFor(data.kind),
      systemPrompt: data.systemPrompt ?? null,
      status: data.kind === "LOCAL" ? "OFFLINE" : "IDLE",
    },
  });

  return NextResponse.json(agent, { status: 201 });
}
