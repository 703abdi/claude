import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inboxResolveSchema } from "@/lib/validation";
import { resolveTz } from "@/lib/hub-data";
import { createAgentTask } from "@/lib/inbox";

/** Session-auth (from the Hub): { action: "task" } turns the item into a task
 * pinned to Today, { action: "dismiss" } just clears it. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/inbox/[id]/resolve">) {
  const { id } = await ctx.params;
  const parsed = inboxResolveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let taskId = item.taskId;
  let task = null;
  if (parsed.data.action === "task" && !taskId) {
    const tz = await resolveTz(req.nextUrl.searchParams.get("tz"));
    task = await createAgentTask({
      agent: item.agent,
      title: item.title,
      notes: [item.body, item.link].filter(Boolean).join("\n\n") || null,
      pinToday: true,
      tz,
    });
    taskId = task.id;
  }

  const updated = await prisma.inboxItem.update({
    where: { id },
    data: { resolvedAt: new Date(), taskId },
  });
  return NextResponse.json({ item: updated, task });
}
