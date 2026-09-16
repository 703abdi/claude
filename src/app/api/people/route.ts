import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { personCreateSchema } from "@/lib/validation";
import { getPeopleWithCounts } from "@/lib/people-data";

export async function GET() {
  const result = await getPeopleWithCounts();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = personCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const existing = await prisma.person.findUnique({ where: { name: parsed.data.name } });
  if (existing) return NextResponse.json(existing, { status: 200 });

  const person = await prisma.person.create({ data: parsed.data });
  return NextResponse.json(person, { status: 201 });
}
