import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { logSignal, type SignalKind } from "@/lib/signals";

const schema = z.object({
  kind: z.enum(["donow.shown", "donow.acted"]),
  ref: z.string().max(200).nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

/** The Hub reports what it showed and what Abdi tapped. Session only. */
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad signal" }, { status: 400 });
  await logSignal(parsed.data.kind as SignalKind, { ref: parsed.data.ref ?? null, data: parsed.data.data });
  return NextResponse.json({ ok: true });
}
