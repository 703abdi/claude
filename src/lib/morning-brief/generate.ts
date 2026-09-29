import { getAnthropicClient, AI_MODEL } from "@/lib/ai";
import type Anthropic from "@anthropic-ai/sdk";
import type { MorningBriefContext } from "./gather";

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function ruleBasedBrief(ctx: MorningBriefContext, today: Date): string {
  const parts: string[] = [];
  parts.push(`Good morning. Here's where things stand on ${fmtDate(today)}.`);

  if (ctx.overdue.length > 0) {
    const names = ctx.overdue.slice(0, 3).map((t) => t.title);
    parts.push(
      `You have ${ctx.overdue.length} overdue ${ctx.overdue.length === 1 ? "item" : "items"}: ${names.join(", ")}${ctx.overdue.length > 3 ? ", and more" : ""}.`
    );
  }

  if (ctx.pinnedToday.length > 0) {
    const names = ctx.pinnedToday.slice(0, 5).map((t) => t.title);
    parts.push(`Today is focused on: ${names.join(", ")}.`);
  } else {
    parts.push("Nothing is pinned to Today yet.");
  }

  if (ctx.waiting.length > 0) {
    const names = ctx.waiting.slice(0, 3).map((t) => t.title);
    parts.push(`${ctx.waiting.length} ${ctx.waiting.length === 1 ? "task is" : "tasks are"} waiting on a follow-up: ${names.join(", ")}.`);
  }

  if (ctx.blocked.length > 0) {
    parts.push(
      `${ctx.blocked.length} ${ctx.blocked.length === 1 ? "task is" : "tasks are"} blocked on something else finishing first.`
    );
  }

  if (ctx.upcomingEvents.length > 0) {
    const names = ctx.upcomingEvents.slice(0, 3).map((e) => `${e.title}${e.startTime ? ` at ${e.startTime}` : ""}`);
    parts.push(`In the next two days: ${names.join(", ")}.`);
  }

  if (ctx.abandoned.length > 0) {
    parts.push(
      `${ctx.abandoned.map((t) => t.title).join(", ")} ${ctx.abandoned.length === 1 ? "hasn't" : "haven't"} moved in a few days — worth a look.`
    );
  }

  if (ctx.peopleWaitingOn.length > 0) {
    parts.push(`People waiting on you: ${ctx.peopleWaitingOn.join(", ")}.`);
  }

  if (ctx.pendingSuggestions.length > 0) {
    parts.push(`There ${ctx.pendingSuggestions.length === 1 ? "is" : "are"} ${ctx.pendingSuggestions.length} open suggestion${ctx.pendingSuggestions.length === 1 ? "" : "s"} worth reviewing.`);
  }

  if (ctx.totalActive === 0) {
    parts.push("Nothing outstanding — you're clear.");
  }

  return parts.join(" ");
}

function summarizeForPrompt(ctx: MorningBriefContext): string {
  const lines: string[] = [];
  lines.push(`Overdue tasks (${ctx.overdue.length}): ${ctx.overdue.map((t) => t.title).join("; ") || "none"}`);
  lines.push(`Pinned to Today (${ctx.pinnedToday.length}): ${ctx.pinnedToday.map((t) => t.title).join("; ") || "none"}`);
  lines.push(
    `Waiting on follow-up (${ctx.waiting.length}): ${ctx.waiting
      .map((t) => `${t.title}${t.followUpPerson ? ` (with ${t.followUpPerson.name})` : ""}`)
      .join("; ") || "none"}`
  );
  lines.push(`Blocked (${ctx.blocked.length}): ${ctx.blocked.map((t) => t.title).join("; ") || "none"}`);
  lines.push(
    `Abandoned / stalled ${5}+ days (${ctx.abandoned.length}): ${ctx.abandoned.map((t) => t.title).join("; ") || "none"}`
  );
  lines.push(
    `Upcoming in 48h (${ctx.upcomingEvents.length}): ${ctx.upcomingEvents
      .map((e) => `${e.title}${e.startTime ? ` at ${e.startTime}` : ""} on ${e.date.toDateString()}`)
      .join("; ") || "none"}`
  );
  lines.push(`People currently owed a response: ${ctx.peopleWaitingOn.join(", ") || "none"}`);
  lines.push(
    `Open AI suggestions (${ctx.pendingSuggestions.length}): ${ctx.pendingSuggestions
      .map((s) => `${s.title} — ${s.reason}`)
      .join("; ") || "none"}`
  );
  lines.push(`Total active tasks: ${ctx.totalActive}`);
  return lines.join("\n");
}

async function aiBrief(ctx: MorningBriefContext, today: Date): Promise<string | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return null;

  const prompt = `You are an intelligent executive assistant writing a spoken morning brief for "abdi", based ONLY on the real data below — never invent tasks, people, or numbers that aren't listed.

Today: ${fmtDate(today)}

${summarizeForPrompt(ctx)}

Priority order when deciding what to emphasize: 1) overdue/responsibility items and people waiting on abdi, 2) small tasks that unlock other work (blockers), 3) deadlines, 4) everything else. Keep it concise — a few short spoken sentences, not an essay. Sound like a calm, competent assistant, not a robot reading a list. If everything is genuinely clear, say so briefly instead of padding.

Respond with ONLY the brief text (plain sentences, no markdown, no headers, no JSON).`;

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return text || null;
}

export async function generateMorningBriefText(ctx: MorningBriefContext, today: Date = new Date()) {
  const ai = await aiBrief(ctx, today).catch(() => null);
  if (ai) return { text: ai, source: "ai" as const };
  return { text: ruleBasedBrief(ctx, today), source: "rule-based" as const };
}

export type { MorningBriefContext };
