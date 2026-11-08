import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { goalUpdateSchema } from "@/lib/validation";
import { ensureGoal } from "@/lib/hub-data";
import { utcDateFromKey } from "@/lib/day";

export async function PATCH(req: NextRequest) {
  const parsed = goalUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const goal = await ensureGoal();
  const d = parsed.data;
  const updated = await prisma.goal.update({
    where: { id: goal.id },
    data: {
      label: d.label,
      targetCents: d.targetCents,
      startDate: d.startDate ? utcDateFromKey(d.startDate) : undefined,
      deadline: d.deadline ? utcDateFromKey(d.deadline) : undefined,
    },
  });
  return NextResponse.json(updated);
}
