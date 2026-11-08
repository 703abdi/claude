import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentCreateSchema } from "@/lib/validation";
import { defaultModelFor } from "@/lib/agents/providers";
import { listAgents } from "@/lib/agents/list";

export async function GET() {
  return NextResponse.json(await listAgents());
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
