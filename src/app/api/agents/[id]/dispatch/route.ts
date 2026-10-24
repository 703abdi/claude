import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentDispatchSchema } from "@/lib/validation";
import { executeGrokRun } from "@/lib/agents/dispatch";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = agentDispatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const run = await prisma.agentRun.create({
    data: {
      agentId: agent.id,
      prompt: parsed.data.prompt,
      taskId: parsed.data.taskId ?? null,
    },
  });

  if (agent.kind === "GROK") {
    after(() => executeGrokRun(run.id));
  }

  return NextResponse.json(run, { status: 201 });
}
