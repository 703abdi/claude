import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Reports which integrations are configured. Never returns secret values. */
export async function GET() {
  const set = (...names: string[]) => names.every((n) => Boolean(process.env[n]));
  const obsidian = await prisma.syncSource.findFirst({
    where: { type: "OBSIDIAN" },
    orderBy: { lastSyncAt: "desc" },
    select: { lastSyncAt: true, lastSyncStatus: true },
  });
  return NextResponse.json({
    connectors: [
      { id: "grok", name: "Grok", group: "Agents", configured: set("XAI_API_KEY") },
      { id: "nvidia", name: "NVIDIA NIM", group: "Agents", configured: set("NVIDIA_API_KEY") },
      { id: "claude", name: "Claude", group: "Agents", configured: set("ANTHROPIC_API_KEY") },
      { id: "local", name: "Local agents", group: "Agents", configured: set("AGENTS_TOKEN") },
      { id: "abdiform", name: "abdiform", group: "Data", configured: set("ABDIFORM_URL", "ABDIFORM_METRICS_TOKEN") },
      {
        id: "obsidian",
        name: "Obsidian vault",
        group: "Data",
        configured: set("OBSIDIAN_SYNC_TOKEN"),
        lastSyncAt: obsidian?.lastSyncAt ?? null,
      },
      { id: "chatgpt", name: "ChatGPT history", group: "Data", configured: set("CHATGPT_CONNECTOR_TOKEN") },
      { id: "claude-history", name: "Claude history", group: "Data", configured: set("CLAUDE_CONNECTOR_TOKEN") },
      { id: "voice", name: "Brief voice", group: "Data", configured: set("TTS_PROVIDER") },
    ],
  });
}
