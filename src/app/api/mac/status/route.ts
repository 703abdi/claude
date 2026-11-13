import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyBearerToken } from "@/lib/sync-auth";
import { macStatusSchema, readMacStatus, saveMacStatus } from "@/lib/mac-status";

export const dynamic = "force-dynamic";

/** The Mac reports its Claude Code sessions here every minute. Bearer AGENTS_TOKEN only.
 * This path skips the session check in src/proxy.ts, so each handler checks auth itself. */
export async function POST(req: NextRequest) {
  if (!verifyBearerToken(req, "AGENTS_TOKEN")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = macStatusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const saved = await saveMacStatus(parsed.data);
  return NextResponse.json({ ok: true, ...saved });
}

/** Home reads this. Online means the last report is under 3 minutes old. Signed-in browser or the agent bearer. */
export async function GET(req: NextRequest) {
  const ok = verifyBearerToken(req, "AGENTS_TOKEN") || !!(await getSession());
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = await readMacStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
