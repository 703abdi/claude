import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dependencySchema } from "@/lib/validation";
import { taskInclude, serializeTask } from "@/lib/serialize";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = dependencySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.blockerId === id) {
    return NextResponse.json({ error: "A task cannot block itself" }, { status: 400 });
  }

  await prisma.taskDependency.upsert({
    where: { blockerId_blockedId: { blockerId: parsed.data.blockerId, blockedId: id } },
    update: {},
    create: { blockerId: parsed.data.blockerId, blockedId: id },
  });

  const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  return NextResponse.json(serializeTask(updated!));
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const blockerId = searchParams.get("blockerId");
  if (!blockerId) return NextResponse.json({ error: "blockerId required" }, { status: 400 });

  await prisma.taskDependency.deleteMany({ where: { blockerId, blockedId: id } });

  const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  return NextResponse.json(serializeTask(updated!));
}
