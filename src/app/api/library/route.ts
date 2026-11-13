import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAgentOrSession } from "@/lib/sync-auth";
import { KINDS, SUBJECT_SLUGS } from "@/lib/library";

/** Library: notes pushed from the Obsidian vault by scripts/sync-library.sh (SOPs folder plus the
 * docs listed in the vault's _scripts/library/meta/*.json). Rows added in the app (addedBy "manual")
 * are never deleted through deletedSlugs.
 * Auth: Authorization: Bearer $AGENTS_TOKEN, or a signed-in session. */

const optText = (max: number) => z.string().max(max).nullish();

const variantSchema = z.object({
  label: z.string().min(1).max(40),
  content: z.string().max(200_000),
  sourcePath: z.string().max(500).optional(),
});

const docSchema = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  folder: z.string().min(1).max(100).default("SOPs"),
  order: z.number().int().default(0),
  content: z.string().max(200_000),
  sourcePath: z.string().min(1).max(500),
  mtime: z.string().datetime(),
  subject: z.enum(SUBJECT_SLUGS as [string, ...string[]]).nullish(),
  source: optText(100),
  topic: optText(100),
  kind: z.enum(KINDS).nullish(),
  summary: optText(2000),
  origin: optText(2000),
  purpose: optText(2000),
  steps: z.array(z.string().min(1).max(300)).max(20).nullish(),
  variants: z.array(variantSchema).max(5).nullish(),
  url: z.string().url().max(2000).nullish(),
  tldr: optText(300),
  useWhen: optText(300),
  fromLine: optText(300),
  example: z.object({ text: z.string().min(1).max(1000), label: z.string().max(100).nullish() }).nullish(),
  links: z.array(z.object({ label: z.string().min(1).max(100), url: z.string().url().max(2000) })).max(5).nullish(),
  related: z.array(z.object({ slug: z.string().min(1).max(200), title: z.string().min(1).max(300) })).max(3).nullish(),
  // Loose on purpose: the app draws the types it knows and ignores the rest.
  visual: z.looseObject({ type: z.string().min(1).max(30) }).nullish(),
  groupLabel: optText(100),
});

const bodySchema = z.object({
  docs: z.array(docSchema).max(200),
  deletedSlugs: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  if (!(await verifyAgentOrSession(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const docs = await prisma.libraryDoc.findMany({
    orderBy: [{ folder: "asc" }, { order: "asc" }, { title: "asc" }],
    select: {
      slug: true,
      title: true,
      folder: true,
      order: true,
      mtime: true,
      updatedAt: true,
      addedBy: true,
      sourcePath: true,
      subject: true,
      source: true,
      topic: true,
      kind: true,
      summary: true,
      origin: true,
      purpose: true,
      steps: true,
      url: true,
      tldr: true,
      groupLabel: true,
    },
  });
  return NextResponse.json(docs);
}

const json = (v: unknown) => (v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

export async function POST(req: NextRequest) {
  if (!(await verifyAgentOrSession(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  const { docs, deletedSlugs } = parsed.data;

  // A synced doc never overwrites one added in the app that happens to share its slug.
  const manual = new Set(
    (await prisma.libraryDoc.findMany({ where: { slug: { in: docs.map((d) => d.slug) }, addedBy: "manual" }, select: { slug: true } })).map((r) => r.slug),
  );
  let upserted = 0;
  let skipped = 0;
  for (const d of docs) {
    if (manual.has(d.slug)) {
      skipped++;
      continue;
    }
    const data = {
      title: d.title,
      folder: d.folder,
      order: d.order,
      content: d.content,
      sourcePath: d.sourcePath,
      mtime: new Date(d.mtime),
      subject: d.subject ?? null,
      source: d.source ?? null,
      topic: d.topic ?? null,
      kind: d.kind ?? null,
      summary: d.summary ?? null,
      origin: d.origin ?? null,
      purpose: d.purpose ?? null,
      steps: json(d.steps),
      variants: json(d.variants),
      url: d.url ?? null,
      tldr: d.tldr ?? null,
      useWhen: d.useWhen ?? null,
      fromLine: d.fromLine ?? null,
      example: json(d.example),
      links: json(d.links),
      related: json(d.related),
      visual: json(d.visual),
      groupLabel: d.groupLabel ?? null,
    };
    await prisma.libraryDoc.upsert({
      where: { slug: d.slug },
      update: data,
      create: { slug: d.slug, ...data, addedBy: "sync" },
    });
    upserted++;
  }
  const deleted = deletedSlugs?.length
    ? (await prisma.libraryDoc.deleteMany({ where: { slug: { in: deletedSlugs }, addedBy: { not: "manual" } } })).count
    : 0;
  return NextResponse.json({ upserted, skipped, deleted });
}
