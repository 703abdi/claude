import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createNote, listNotes } from "@/lib/notes";

const createSchema = z.object({
  title: z.string().max(300).optional(),
  body: z.string().max(200_000).optional(),
});

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listNotes());
}

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const json = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const note = await createNote(parsed.data);
  return NextResponse.json(note, { status: 201 });
}
