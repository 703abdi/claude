import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { zapierSecret } from "@/lib/sources";
import { resolveTz } from "@/lib/hub-data";
import { createAgentTask, findPersonByName, parseAgentDue } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/** Webhooks by Zapier posts here. The URL (with ?key=) is shown in Settings.
 * Body is loose on purpose: Zapier field names vary. */
const schema = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(10_000).optional().nullable(),
  link: z.string().url().max(2000).optional().nullable(),
  kind: z.enum(["task", "note", "update", "question"]).optional(),
  person: z.string().max(120).optional().nullable(),
  due: z.string().max(40).optional().nullable(),
  source: z.string().max(40).optional().nullable(),
});

function keyOk(req: NextRequest) {
  const given = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-hook-key") ?? "";
  const want = zapierSecret();
  if (given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

export async function POST(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw) return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  // Accept common Zapier spellings.
  const norm = {
    title: raw.title ?? raw.Title ?? raw.name ?? raw.subject ?? raw.summary,
    body: raw.body ?? raw.Body ?? raw.description ?? raw.notes ?? raw.text ?? null,
    link: raw.link ?? raw.url ?? raw.Link ?? null,
    kind: raw.kind ?? (raw.task ? "task" : undefined),
    person: raw.person ?? raw.name_of_person ?? raw.lead ?? raw.contact ?? null,
    due: raw.due ?? raw.due_date ?? raw.date ?? null,
    source: raw.source ?? raw.app ?? "zapier",
  };
  const parsed = schema.safeParse(norm);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const agent = `zap:${String(d.source ?? "zapier").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || "zapier"}`;
  const kind = d.kind ?? "update";

  let task = null;
  if (kind === "task") {
    const tz = await resolveTz(req.nextUrl.searchParams.get("tz"));
    const person = await findPersonByName(d.person);
    task = await createAgentTask({
      agent,
      title: d.title,
      notes: [d.body, d.link].filter(Boolean).join("\n\n") || null,
      due: d.due ? parseAgentDue(d.due, tz) : null,
      personId: person?.id ?? null,
      tz,
    });
  }
  const item = await prisma.inboxItem.create({
    data: { agent, kind, title: d.title, body: d.body ?? null, link: d.link ?? null, taskId: task?.id ?? null },
  });
  return NextResponse.json({ ok: true, item: item.id, task: task?.id ?? null }, { status: 201 });
}
