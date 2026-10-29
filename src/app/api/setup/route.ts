import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSeed } from "@/lib/db-seed";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(req: NextRequest, secret: string): boolean {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ") && safeEqual(header.slice("Bearer ".length).trim(), secret)) {
    return true;
  }
  const queryKey = req.nextUrl.searchParams.get("key");
  if (queryKey && safeEqual(queryKey, secret)) return true;
  return false;
}

/**
 * One-time setup endpoint: creates the admin user + demo data. Exists
 * because a fresh deploy's database is otherwise only reachable over raw
 * Postgres TCP, which some environments (sandboxes, restrictive egress
 * proxies, certain CI runners) can't open — this runs the same seed logic
 * through the app's own HTTPS surface instead. Gated on AUTH_SECRET
 * (already required, already private) rather than a new env var. Safe to
 * call repeatedly: it upserts the admin user and only seeds demo data once.
 *
 * GET (with ?key=) exists so this can be triggered by opening a plain
 * link in a browser — no terminal or HTTP client needed. POST with a
 * Bearer header also works for scripted use.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not configured" }, { status: 503 });
  }
  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSeed(prisma);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not configured" }, { status: 503 });
  }
  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized — add ?key=<AUTH_SECRET> to the URL" }, { status: 401 });
  }
  const result = await runSeed(prisma);
  return NextResponse.json(result);
}
