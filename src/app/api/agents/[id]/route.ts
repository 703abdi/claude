import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { count } = await prisma.agent.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
