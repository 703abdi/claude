import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { memoryStats } from "@/lib/memory";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await memoryStats());
}
