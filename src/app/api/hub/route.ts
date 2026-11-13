import { NextRequest, NextResponse } from "next/server";
import { getHubData } from "@/lib/hub-data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tz = req.nextUrl.searchParams.get("tz");
  const data = await getHubData({ tz });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
