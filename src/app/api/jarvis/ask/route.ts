import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { AI_MODEL, getAnthropicClient } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { briefingAsContext, getBriefing } from "@/lib/jarvis/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_OUTPUT_TOKENS = 400;
const body = z.object({ question: z.string().trim().min(1).max(600), tz: z.string().max(60).optional() });

const SYSTEM = `You are Jarvis, Abdi's personal assistant inside his private dashboard. You answer out loud, so keep it to one to three short sentences, plain words, no lists, no markdown. Be direct. Only use the facts in the snapshot below. If the snapshot does not have the answer, say you don't have that and stop. Never invent meetings, people, times or numbers. This is his personal dashboard: business numbers live in a separate agency dashboard, so don't bring up money.`;

/** Ask Jarvis a question about the day. Answers from live rows, capped at 400 tokens. */
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return NextResponse.json({ error: "Jarvis can't answer questions yet: ANTHROPIC_API_KEY isn't set on this deployment. The briefing still works." }, { status: 503 });
  }

  const briefing = await getBriefing({ tz: parsed.data.tz, sync: false });
  const people = await prisma.person.findMany({ select: { name: true, notes: true }, orderBy: { name: "asc" }, take: 60 });
  const peopleBlock = people.map((p) => `- ${p.name}${p.notes ? `: ${p.notes.replace(/\s+/g, " ").slice(0, 160)}` : ""}`).join("\n");

  try {
    const message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Snapshot of Abdi's day:\n\n${briefingAsContext(briefing)}\n\nPeople he tracks:\n${peopleBlock || "- none"}\n\nAbdi asks: ${parsed.data.question}`,
        },
      ],
    });
    const answer = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return NextResponse.json({ answer: answer || "I don't have that." }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const msg = status === 401 ? "The AI key was rejected. Check ANTHROPIC_API_KEY in Vercel." : status === 429 ? "The AI is rate-limited right now. Try again in a minute." : "Jarvis couldn't reach the AI just now.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
