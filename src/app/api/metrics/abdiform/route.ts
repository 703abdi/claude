import { NextResponse } from "next/server";
import { fetchAbdiformMetrics } from "@/lib/abdiform";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await fetchAbdiformMetrics());
}
