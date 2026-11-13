import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sourceStatuses, zapierSecret } from "@/lib/sources";

export const dynamic = "force-dynamic";

/** Every source, with connected / not set and the last pull. Session only. */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sources = await sourceStatuses();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return NextResponse.json({ sources, zapierUrl: `${origin}/api/hooks/zapier?key=${zapierSecret()}` });
}
