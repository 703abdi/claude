import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dismissNudge } from "@/lib/jarvis/nudges";

type Params = { params: Promise<{ id: string }> };

/** Hides one nudge from Home. */
export async function POST(_req: NextRequest, { params }: Params) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await dismissNudge(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
