import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ position: z.number().min(0) });

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.morningBrief.update({
    where: { id },
    data: { lastPlaybackPosition: parsed.data.position },
  });

  return NextResponse.json({ ok: true });
}
