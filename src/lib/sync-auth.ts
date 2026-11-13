import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Verifies a bearer token against the given env var. Used by machine-to-machine
 * ingestion endpoints (Obsidian sync agent, ChatGPT connector) that can't use the
 * browser session cookie. */
export function verifyBearerToken(req: NextRequest, envVarName: string): boolean {
  const expected = process.env[envVarName];
  if (!expected) return false; // not configured — endpoint stays closed
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  return safeEqual(token, expected);
}

/** Agent endpoints (/api/inbox, /api/state) accept the AGENTS_TOKEN bearer
 * or a signed-in browser session. They are exempt from the session check in
 * src/proxy.ts, so the handler must call this. */
export async function verifyAgentOrSession(req: NextRequest): Promise<"agent" | "session" | null> {
  if (verifyBearerToken(req, "AGENTS_TOKEN")) return "agent";
  return (await getSession()) ? "session" : null;
}
