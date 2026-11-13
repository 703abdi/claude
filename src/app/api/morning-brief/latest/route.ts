import { NextResponse } from "next/server";
import { getLatestBrief } from "@/lib/morning-brief/latest";

export async function GET() {
  return NextResponse.json(await getLatestBrief());
}
