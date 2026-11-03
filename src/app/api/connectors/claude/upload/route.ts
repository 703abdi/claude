import { NextRequest, NextResponse } from "next/server";
import { parseClaudeExport } from "@/lib/context/claude-export";
import { ingestContextItems } from "@/lib/context/ingest";
import { runExtractionPipeline } from "@/lib/context/extract";
import { prisma } from "@/lib/prisma";
import { ContextSourceType } from "@prisma/client";

const MAX_BODY_BYTES = 15 * 1024 * 1024; // 15MB — keep uploads to recent conversations, not a full multi-year export

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "File too large. Export a smaller date range or trim conversations.json before uploading." },
      { status: 413 }
    );
  }

  const json = await req.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "Could not parse conversations.json" }, { status: 400 });
  }

  let items;
  try {
    items = parseClaudeExport(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid export format" }, { status: 400 });
  }

  const ingested = await ingestContextItems(items);
  const extraction = await runExtractionPipeline(items.length);

  await prisma.syncSource.upsert({
    where: { type_name: { type: ContextSourceType.CLAUDE, name: "default" } },
    update: { lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    create: { type: ContextSourceType.CLAUDE, name: "default", lastSyncAt: new Date(), lastSyncStatus: "success" },
  });

  return NextResponse.json({ ingested: ingested.length, extraction });
}
