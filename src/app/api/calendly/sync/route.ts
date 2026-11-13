import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { calendlyStatus, syncCalendly } from "@/lib/calendly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: Calendly connection status. POST: pull now (ignores the 15 minute throttle). */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await calendlyStatus());
}

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncCalendly({ force: true });
  return NextResponse.json({ result, status: await calendlyStatus() });
}
