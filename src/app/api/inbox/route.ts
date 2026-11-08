import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAgentOrSession } from "@/lib/sync-auth";
import { inboxCreateSchema } from "@/lib/validation";
import { resolveTz } from "@/lib/hub-data";
import { createAgentTask, findPersonByName, parseAgentDue } from "@/lib/inbox";

/** Agents (Grok, Codex, Claude Code, Jarvis) write into the OS here.
 * Auth: Authorization: Bearer $AGENTS_TOKEN. See docs/agent-api.md. */
export async function POST(req: NextRequest) {
  if (!(await verifyAgentOrSession(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = inboxCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  let task = null;
  let personMatched: string | null = null;
  if (d.kind === "task") {
    const tz = await resolveTz(req.nextUrl.searchParams.get("tz"));
    const person = await findPersonByName(d.person);
    personMatched = person?.name ?? null;
    const notes = [d.body, d.link].filter(Boolean).join("\n\n") || null;
    task = await createAgentTask({
      agent: d.agent,
      title: d.title,
      notes,
      due: d.due ? parseAgentDue(d.due, tz) : null,
      personId: person?.id ?? null,
      pinToday: d.pinToday ?? true,
      tz,
    });
  }

  const item = await prisma.inboxItem.create({
    data: {
      agent: d.agent,
      kind: d.kind,
      title: d.title,
      body: d.body ?? null,
      link: d.link ?? null,
      taskId: task?.id ?? null,
    },
  });

  return NextResponse.json({ item, task, personMatched }, { status: 201 });
}
