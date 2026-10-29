import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, name: true, morningBriefTime: true, timezone: true, voiceStyle: true, ttsProvider: true },
  });
  return NextResponse.json(user);
}

const updateSchema = z.object({
  morningBriefTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional(),
  timezone: z.string().optional(),
  voiceStyle: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: parsed.data,
    select: { email: true, name: true, morningBriefTime: true, timezone: true, voiceStyle: true, ttsProvider: true },
  });
  return NextResponse.json(user);
}
