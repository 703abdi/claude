import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recentActions } from "@/lib/jarvis/actions";

export const dynamic = "force-dynamic";

/** The last 20 things Jarvis did, newest first. */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await recentActions(20), { headers: { "Cache-Control": "no-store" } });
}
