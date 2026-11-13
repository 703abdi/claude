import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { disconnectGoogle, googleStatus, syncGoogle } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: connection status. POST: pull now. DELETE: disconnect and revoke. Session only. */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await googleStatus());
}

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncGoogle({ force: true });
  return NextResponse.json({ result, status: await googleStatus() });
}

export async function DELETE() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await disconnectGoogle();
  return NextResponse.json({ ok: true, status: await googleStatus() });
}
