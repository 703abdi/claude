import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreUpdateSchema } from "@/lib/validation";
import { resolveTz } from "@/lib/hub-data";
import { dayKey, utcDateFromKey } from "@/lib/day";

/** POST { date?, field, delta } adds to one counter; POST { date?, values } sets them.
 * date is a YYYY-MM-DD local day and defaults to today. */
export async function POST(req: NextRequest) {
  const parsed = scoreUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tz = await resolveTz(req.nextUrl.searchParams.get("tz"));
  const key = parsed.data.date ?? dayKey(new Date(), tz);
  const date = utcDateFromKey(key);

  let entry;
  if ("field" in parsed.data) {
    const { field, delta } = parsed.data;
    entry = await prisma.scoreEntry.upsert({
      where: { date },
      create: { date, [field]: Math.max(0, delta) },
      update: { [field]: { increment: delta } },
    });
    // Never let a counter go below zero.
    if (entry[field] < 0) entry = await prisma.scoreEntry.update({ where: { date }, data: { [field]: 0 } });
  } else {
    const values = parsed.data.values;
    entry = await prisma.scoreEntry.upsert({ where: { date }, create: { date, ...values }, update: values });
  }

  return NextResponse.json({
    date: key,
    dials: entry.dials,
    convos: entry.convos,
    booked: entry.booked,
    cashCents: entry.cashCents,
  });
}
