import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { weekUpdateSchema } from "@/lib/validation";
import { ensureWeekPlan, normalizeOutcomes, resolveTz } from "@/lib/hub-data";
import { utcDateFromKey, weekStartKey } from "@/lib/day";

export async function PATCH(req: NextRequest) {
  const parsed = weekUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tz = await resolveTz(req.nextUrl.searchParams.get("tz"));
  const key = parsed.data.weekStart ?? weekStartKey(new Date(), tz);
  if (utcDateFromKey(key).getUTCDay() !== 0) {
    return NextResponse.json({ error: "weekStart must be a Sunday" }, { status: 400 });
  }
  await ensureWeekPlan(key);
  const outcomes = parsed.data.outcomes.map((o) => ({ text: o.text.trim(), done: o.done }));
  const plan = await prisma.weekPlan.update({ where: { weekStart: utcDateFromKey(key) }, data: { outcomes } });
  return NextResponse.json({ weekStart: key, outcomes: normalizeOutcomes(plan.outcomes) });
}
