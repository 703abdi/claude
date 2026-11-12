import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { resolveTz } from "@/lib/hub-data";
import { ActionError, undoAction } from "@/lib/jarvis/actions";

export const dynamic = "force-dynamic";

const body = z.object({ id: z.string().trim().min(1).max(64), tz: z.string().max(60).optional() });

/** Undo one Jarvis action. 409 when it was already undone or can't be undone. */
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Which action should I undo?" }, { status: 400 });
  try {
    const out = await undoAction(parsed.data.id, { tz: await resolveTz(parsed.data.tz) });
    return NextResponse.json({ ok: true, summary: out.summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ActionError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("[jarvis] undo failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The undo didn't go through. Try again." }, { status: 500 });
  }
}
