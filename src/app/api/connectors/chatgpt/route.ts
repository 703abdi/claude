import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyBearerToken } from "@/lib/sync-auth";
import { ingestContextItems } from "@/lib/context/ingest";
import { runExtractionPipeline } from "@/lib/context/extract";
import { prisma } from "@/lib/prisma";
import { ContextSourceType } from "@prisma/client";

/**
 * Bearer-token-protected batch ingestion endpoint, mirroring the Obsidian
 * sync agent's contract. There is no OpenAI API that streams a user's
 * ChatGPT history to a third party today, so nothing calls this route
 * automatically yet — the working path is the session-authenticated
 * /api/connectors/chatgpt/upload endpoint fed by ChatGPT's manual data
 * export. This route exists so a future automated bridge (should OpenAI
 * ever expose one, or a local export-watcher script) can push data in
 * without any other code changing.
 */
const bodySchema = z.object({
  conversations: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().optional().nullable(),
        content: z.string(),
        updatedAt: z.string().datetime(),
      })
    )
    .max(200),
});

export async function POST(req: NextRequest) {
  if (!verifyBearerToken(req, "CHATGPT_CONNECTOR_TOKEN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ingested = await ingestContextItems(
    parsed.data.conversations.map((c) => ({
      source: ContextSourceType.CHATGPT,
      sourceId: c.id,
      sourceUrl: null,
      timestamp: c.updatedAt,
      content: c.title ? `[${c.title}]\n${c.content}` : c.content,
      project: null,
    }))
  );

  const extraction = await runExtractionPipeline(parsed.data.conversations.length);

  await prisma.syncSource.upsert({
    where: { type_name: { type: ContextSourceType.CHATGPT, name: "default" } },
    update: { lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    create: { type: ContextSourceType.CHATGPT, name: "default", lastSyncAt: new Date(), lastSyncStatus: "success" },
  });

  return NextResponse.json({ ingested: ingested.length, extraction });
}
