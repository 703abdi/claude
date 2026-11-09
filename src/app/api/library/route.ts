import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAgentOrSession } from "@/lib/sync-auth";

/** Library: notes pushed from the Obsidian vault. scripts/sync-library.sh sends the SOPs folder.
 * Auth: Authorization: Bearer $AGENTS_TOKEN, or a signed-in session. */

const docSchema = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  folder: z.string().min(1).max(100).default("SOPs"),
  order: z.number().int().default(0),
  content: z.string().max(200_000),
  sourcePath: z.string().min(1).max(500),
  mtime: z.string().datetime(),
});

const bodySchema = z.object({
  docs: z.array(docSchema).max(200),
  deletedSlugs: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  if (!(await verifyAgentOrSession(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const docs = await prisma.libraryDoc.findMany({
    orderBy: [{ folder: "asc" }, { order: "asc" }, { title: "asc" }],
    select: { slug: true, title: true, folder: true, order: true, mtime: true, updatedAt: true },
  });
  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAgentOrSession(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { docs, deletedSlugs } = parsed.data;

  let upserted = 0;
  for (const d of docs) {
    await prisma.libraryDoc.upsert({
      where: { slug: d.slug },
      update: { title: d.title, folder: d.folder, order: d.order, content: d.content, sourcePath: d.sourcePath, mtime: new Date(d.mtime) },
      create: { ...d, mtime: new Date(d.mtime) },
    });
    upserted++;
  }
  const deleted = deletedSlugs?.length ? (await prisma.libraryDoc.deleteMany({ where: { slug: { in: deletedSlugs } } })).count : 0;
  return NextResponse.json({ upserted, deleted });
}
