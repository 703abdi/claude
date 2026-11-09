import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAgentOrSession } from "@/lib/sync-auth";
import { inboxCreateSchema } from "@/lib/validation";
import { resolveTz } from "@/lib/hub-data";
import { createAgentTask, findPersonByName, parseAgentDue } from "@/lib/inbox";
import { dayKey, utcDateFromKey } from "@/lib/day";
import { logSignal } from "@/lib/signals";
import { pushLater } from "@/lib/push";

/** Agents (Grok, Codex, Claude Code, Jarvis) write into the OS here.
 * Auth: Authorization: Bearer $AGENTS_TOKEN. See docs/agent-api.md. */
export async function POST(req: NextRequest) {
  if (!(await verifyAgentOrSession(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = inboxCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const tz = await resolveTz(req.nextUrl.searchParams.get("tz"));

  let task = null;
  let personMatched: string | null = null;
  if (d.kind === "task") {
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

  // Optional scoreboard write: the day's totals (dials, convos, booked, cash) set in one go,
  // so a dialer report can post its numbers and the Hub counters follow.
  let score = null;
  if (d.counters || d.cash != null) {
    const values: { dials?: number; convos?: number; booked?: number; cashCents?: number } = {};
    if (d.counters?.dials != null) values.dials = d.counters.dials;
    const convos = d.counters?.convos ?? d.counters?.conversations;
    if (convos != null) values.convos = convos;
    if (d.counters?.booked != null) values.booked = d.counters.booked;
    if (d.cash != null) values.cashCents = Math.round(d.cash * 100);
    if (Object.keys(values).length) {
      const key = d.day ?? dayKey(new Date(), tz);
      const date = utcDateFromKey(key);
      const entry = await prisma.scoreEntry.upsert({ where: { date }, create: { date, ...values }, update: values });
      score = { date: key, dials: entry.dials, convos: entry.convos, booked: entry.booked, cashCents: entry.cashCents };
    }
  }

  if (d.agent !== "os") {
    const what = d.kind === "question" ? "needs your answer" : d.kind === "task" ? "added a task" : "posted an update";
    pushLater({ title: `${d.agent} ${what}`, body: d.title, url: d.kind === "task" && task ? `/tasks?highlight=${task.id}` : "/hub#feed", tag: `inbox-${item.id}` });
  }
  void logSignal("feed.post", { source: d.agent, ref: item.id, data: { kind: d.kind, title: d.title, taskId: task?.id ?? null, score: Boolean(score) } });
  if (score) void logSignal("score.set", { source: d.agent, data: { ...score } });

  return NextResponse.json({ item, task, personMatched, score }, { status: 201 });
}
