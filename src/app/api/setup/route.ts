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

/**
 * One-time HTTPS setup endpoint: creates the admin user + demo data.
 * Exists because a fresh deploy's database is otherwise only reachable
 * over raw Postgres TCP, which some environments (sandboxes, certain CI
 * runners) can't open — this runs the same seed logic through the app's
 * own HTTPS surface instead. Gated on AUTH_SECRET (already required,
 * already private) rather than a new env var. Safe to call repeatedly:
 * it upserts the admin user and only seeds demo data once.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not configured" }, { status: 503 });
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || !safeEqual(header.slice("Bearer ".length).trim(), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSeed(prisma);
  return NextResponse.json(result);
}
