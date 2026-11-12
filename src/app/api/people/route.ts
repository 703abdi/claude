import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { personCreateSchema } from "@/lib/validation";
import { getPeopleSummaries } from "@/lib/people-data";
import { indexPerson } from "@/lib/memory";

export async function GET() {
  const result = await getPeopleSummaries();
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
  // Notes go into memory so Jarvis can find them. A memory failure never blocks the save.
  if (person.notes?.trim()) await indexPerson(person).catch(() => null);
  return NextResponse.json(person, { status: 201 });
}
