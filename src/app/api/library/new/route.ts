import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAgentOrSession } from "@/lib/sync-auth";
import { DEFAULT_MANUAL_SOURCE, SUBJECT_SLUGS, slugify, uniqueSlug } from "@/lib/library";

/** Add new: a note or a link typed into the app. Saved with addedBy "manual", so the vault sync
 * never deletes or overwrites it. */

const bodySchema = z
  .object({
    title: z.string().trim().min(1, "Give it a title.").max(300),
    content: z.string().max(200_000).default(""),
    url: z
      .string()
      .trim()
      .max(2000)
      .transform((v) => v || null)
      .pipe(z.string().url("That link does not look right.").nullable())
      .nullish(),
    subject: z.enum(SUBJECT_SLUGS as [string, ...string[]], "Pick a subject."),
    source: z.string().trim().max(100).nullish(),
    topic: z.string().trim().max(100).nullish(),
    kind: z.enum(["note", "link"]).optional(),
    summary: z.string().trim().max(2000).nullish(),
  })
  .refine((b) => b.content.trim().length > 0 || !!b.url, { message: "Paste some text or a link.", path: ["content"] });

export async function POST(req: NextRequest) {
  if (!(await verifyAgentOrSession(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "That did not save.";
    return NextResponse.json({ error: first }, { status: 400 });
  }
  const b = parsed.data;
  const base = slugify(b.title) || "item";
  const taken = new Set(
    (await prisma.libraryDoc.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((r) => r.slug),
  );
  // "new" and "browse" are pages under /library, so a doc can't take those slugs.
  taken.add("new");
  taken.add("browse");
  const slug = uniqueSlug(base, taken);
  const kind = b.kind ?? (b.url && !b.content.trim() ? "link" : "note");

  const doc = await prisma.libraryDoc.create({
    data: {
      slug,
      title: b.title,
      folder: b.source || DEFAULT_MANUAL_SOURCE,
      order: 99,
      content: b.content,
      sourcePath: "manual",
      mtime: new Date(),
      subject: b.subject,
      source: b.source || DEFAULT_MANUAL_SOURCE,
      topic: b.topic || null,
      kind,
      summary: b.summary || null,
      url: b.url ?? null,
      addedBy: "manual",
    },
    select: { slug: true },
  });
  return NextResponse.json(doc, { status: 201 });
}
