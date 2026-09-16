import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reorderSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = reorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.items.map((item) =>
      prisma.task.update({ where: { id: item.id }, data: { position: item.position } })
    )
  );

  await prisma.taskEvent.createMany({
    data: parsed.data.items.map((item) => ({
      taskId: item.id,
      type: "reordered",
      actor: "user",
    })),
  });

  return NextResponse.json({ ok: true });
}
