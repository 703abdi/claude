import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fathomStatus, syncFathom } from "@/lib/fathom";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: Fathom connection status. POST: pull now (ignores the 30 minute throttle). */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await fathomStatus());
}

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncFathom({ force: true });
  return NextResponse.json({ result, status: await fathomStatus() });
}
