import { z } from "zod";
import { prisma } from "@/lib/prisma";

/** What the Mac last said about its Claude Code sessions. One JSON blob in SyncSource,
 * written every minute by scripts/mac/mac-report.mjs. */

const SOURCE = { type: "MANUAL" as const, name: "mac-jarvis" };
export const ONLINE_MS = 3 * 60_000;
const MAX_TEXT = 200;

const text = z.string().transform((s) => s.slice(0, MAX_TEXT));

export const macStatusSchema = z.object({
  sessions: z
    .array(
      z.object({
        name: text,
        state: z.enum(["running", "waiting", "idle"]),
        detail: text.optional(),
      })
    )
    .max(30),
});

export type MacSession = { name: string; state: "running" | "waiting" | "idle"; detail?: string };
export type MacStatus = { online: boolean; updatedAt: string | null; sessions: MacSession[] };

export async function saveMacStatus(input: z.infer<typeof macStatusSchema>) {
  const now = new Date();
  const config = { sessions: input.sessions, reportedAt: now.toISOString() };
  await prisma.syncSource.upsert({
    where: { type_name: SOURCE },
    create: { ...SOURCE, config, lastSyncAt: now, lastSyncStatus: "success" },
    update: { config, lastSyncAt: now, lastSyncStatus: "success", lastSyncError: null },
  });
  return { savedAt: now.toISOString(), count: input.sessions.length };
}

export async function readMacStatus(now = new Date()): Promise<MacStatus> {
  const row = await prisma.syncSource.findUnique({ where: { type_name: SOURCE }, select: { config: true, lastSyncAt: true } });
  if (!row?.lastSyncAt) return { online: false, updatedAt: null, sessions: [] };
  const parsed = macStatusSchema.safeParse(row.config ?? {});
  const sessions = parsed.success ? parsed.data.sessions : [];
  return {
    online: now.getTime() - row.lastSyncAt.getTime() < ONLINE_MS,
    updatedAt: row.lastSyncAt.toISOString(),
    sessions,
  };
}
