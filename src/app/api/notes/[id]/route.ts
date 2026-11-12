import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { deleteNote, getNote, updateNote } from "@/lib/notes";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  title: z.string().max(300).optional(),
  body: z.string().max(200_000).optional(),
  pinned: z.boolean().optional(),
});

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await getSession())) return unauthorized();
  const { id } = await params;
  const note = await getNote(id);
  return note ? NextResponse.json(note) : notFound();
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await getSession())) return unauthorized();
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!(await getNote(id))) return notFound();
  return NextResponse.json(await updateNote(id, parsed.data));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await getSession())) return unauthorized();
  const { id } = await params;
  if (!(await getNote(id))) return notFound();
  await deleteNote(id);
  return NextResponse.json({ ok: true });
}
