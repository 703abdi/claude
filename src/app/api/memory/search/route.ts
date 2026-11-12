import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchMemory } from "@/lib/memory";

/** GET /api/memory/search?q=...&limit=6&sources=vault,fathom */
export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const limit = Number(sp.get("limit") ?? "") || undefined;
  const sources = (sp.get("sources") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hits = await searchMemory(q, { limit, sources: sources.length ? sources : undefined });
  return NextResponse.json({ hits });
}
