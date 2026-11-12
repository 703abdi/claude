import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { verifyBearerToken } from "@/lib/sync-auth";
import { deleteMemory, upsertMemory } from "@/lib/memory";

export const maxDuration = 60;

/** The Mac sync script (scripts/memory-sync.mjs) sends vault files and chats here.
 * Auth: Bearer OBSIDIAN_SYNC_TOKEN or AGENTS_TOKEN, or a signed-in session.
 * Public in src/proxy.ts, so this handler checks auth itself. */

const source = z.enum(["vault", "chat"]);

const ingestSchema = z.object({
  docs: z
    .array(
      z.object({
        source,
        externalId: z.string().min(1).max(1000),
        title: z.string().max(500),
        body: z.string().max(400_000),
        url: z.string().max(2000).optional().nullable(),
        date: z.iso.datetime({ offset: true }).optional().nullable(),
      })
    )
    .max(200)
    .default([]),
  deleted: z
    .array(z.object({ source, externalId: z.string().min(1).max(1000) }))
    .max(2000)
    .optional(),
});

async function authorised(req: NextRequest) {
  if (verifyBearerToken(req, "OBSIDIAN_SYNC_TOKEN") || verifyBearerToken(req, "AGENTS_TOKEN")) return true;
  return (await getSession()) !== null;
}

export async function POST(req: NextRequest) {
  if (!(await authorised(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ingestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  let upserted = 0;
  let unchanged = 0;
  let deleted = 0;
  for (const d of parsed.data.docs) {
    const r = await upsertMemory({
      source: d.source,
      externalId: d.externalId,
      title: d.title,
      body: d.body,
      url: d.url ?? null,
      date: d.date ? new Date(d.date) : null,
    });
    if (r.changed) upserted++;
    else unchanged++;
  }
  for (const d of parsed.data.deleted ?? []) {
    await deleteMemory(d.source, d.externalId);
    deleted++;
  }
  return NextResponse.json({ upserted, unchanged, deleted });
}
