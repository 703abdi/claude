import { NextResponse } from "next/server";
import { runDailyRefresh } from "@/lib/daily-refresh";

export const maxDuration = 60;

export async function POST() {
  const result = await runDailyRefresh();
  return NextResponse.json(result);
}
