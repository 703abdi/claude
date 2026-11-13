import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { brainStatus, runBrain } from "@/lib/brain";
import { getPolicy, policyHistory, rollbackPolicy, sanitizeChanges, savePolicy, POLICY_BOUNDS, KNOB_LABEL } from "@/lib/policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: live policy, history, last brain run. POST ?run=1 runs the pass now; ?rollback=1 makes
 * the previous policy live; a JSON body of knob changes saves a new version by Abdi. */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [policy, history, status] = await Promise.all([getPolicy(), policyHistory(8), brainStatus()]);
  return NextResponse.json({ ...policy, history, status, bounds: POLICY_BOUNDS, labels: KNOB_LABEL });
}

const knobSchema = z.object({ changes: z.record(z.string(), z.union([z.number(), z.boolean()])), reason: z.string().max(300).optional() });

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  if (q.get("run") === "1") return NextResponse.json({ result: await runBrain({ force: true }), status: await brainStatus() });
  if (q.get("rollback") === "1") return NextResponse.json(await rollbackPolicy());
  const parsed = knobSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { policy } = await getPolicy();
  const changes = sanitizeChanges(policy, parsed.data.changes);
  if (!Object.keys(changes).length) return NextResponse.json({ error: "nothing changed" }, { status: 400 });
  return NextResponse.json(await savePolicy(changes, parsed.data.reason?.trim() || "Set by Abdi in Settings.", "abdi"));
}
