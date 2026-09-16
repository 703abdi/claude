import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyBearerToken } from "@/lib/sync-auth";
import { ingestContextItems } from "@/lib/context/ingest";
import { runExtractionPipeline } from "@/lib/context/extract";
import { prisma } from "@/lib/prisma";
import { ContextSourceType } from "@prisma/client";

const bodySchema = z.object({
  notes: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string(),
        mtime: z.string().datetime(),
      })
    )
    .max(200),
  deletedPaths: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  if (!verifyBearerToken(req, "OBSIDIAN_SYNC_TOKEN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { notes, deletedPaths } = parsed.data;

  if (deletedPaths?.length) {
    await prisma.contextItem.deleteMany({
      where: { source: ContextSourceType.OBSIDIAN, sourceId: { in: deletedPaths } },
    });
  }

  const ingested = await ingestContextItems(
    notes.map((n) => ({
      source: ContextSourceType.OBSIDIAN,
      sourceId: n.path,
      sourceUrl: n.path,
      timestamp: n.mtime,
      content: n.content,
      project: n.path.split("/")[0] || null,
    }))
  );

  const extraction = await runExtractionPipeline(notes.length);

  await prisma.syncSource.upsert({
    where: { type_name: { type: ContextSourceType.OBSIDIAN, name: "default" } },
    update: { lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    create: {
      type: ContextSourceType.OBSIDIAN,
      name: "default",
      lastSyncAt: new Date(),
      lastSyncStatus: "success",
    },
  });

  return NextResponse.json({ ingested: ingested.length, deleted: deletedPaths?.length ?? 0, extraction });
}
