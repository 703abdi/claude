import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getHubData, ensureWeekPlan, normalizeOutcomes } from "@/lib/hub-data";
import { addDaysKey, dayKey, utcDateFromKey, weekStartKey } from "@/lib/day";
import { nextAction } from "@/lib/next-action";
import { describeScore, formatMoney } from "@/lib/command-parse";
import { pushLater } from "@/lib/push";

/** Messages the OS sends to Abdi. Each one is posted to the agent feed (agent "os") and,
 * when RESEND_API_KEY and DIGEST_TO are set, emailed. Twilio can hang off the same text later. */

const FROM = process.env.DIGEST_FROM ?? "Abdi's OS <os@resend.dev>";

export async function deliver(subject: string, text: string, link?: string) {
  const item = await prisma.inboxItem.create({
    data: { agent: "os", kind: "update", title: subject, body: text, link: link ?? null },
  });
  pushLater({ title: subject, body: text.split("\n").filter((l) => l.trim() && !l.startsWith("http")).slice(0, 2).join(" "), url: link ?? "/hub", tag: `digest-${subject.split(":")[0].toLowerCase()}` });
  let emailed = false;
  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.DIGEST_TO?.trim();
  if (key && to) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    emailed = !!res?.ok;
  }
  return { itemId: item.id, emailed };
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
}

/** 7am: the Do-this-now line, today's three, calls before noon. */
export async function morningDigest() {
  const d = await getHubData({ lean: true });
  const now = new Date();
  const action = nextAction(d, now);
  const three = d.today.slice(0, 3).map((t) => `- ${t.title}${t.people[0] ? ` (${t.people[0].name})` : ""}`);
  const calls = d.upNext
    .filter((e) => dayKey(new Date(e.date), d.tz) === d.todayKey && e.startTime)
    .map((e) => `- ${e.startTime} ${e.title}`);
  const lines = [
    `Do this now: ${action.title}`,
    action.detail,
    "",
    three.length ? "Today's three:" : "Today is clear. Pick one outcome.",
    ...three,
    ...(calls.length ? ["", "Calls today:", ...calls] : []),
    "",
    `Cash: ${formatMoney(d.week.goal.collectedCents)} of ${formatMoney(d.week.goal.targetCents)}, ${d.week.goal.daysLeft} days left.`,
    "",
    `${appUrl()}/hub`,
  ];
  return deliver("Morning: do this now", lines.join("\n"), `${appUrl()}/hub`);
}

/** 9pm: the day's numbers and what slipped. */
export async function eveningDigest() {
  const d = await getHubData({ lean: true });
  const s = d.week.scoreboard.today;
  const late = d.today.filter((t) => t.overdue).length;
  const lines = [
    `Today: ${describeScore("dials", s.dials)}, ${describeScore("convos", s.convos)}, ${describeScore("booked", s.booked)}, ${formatMoney(s.cashCents)} cash.`,
    `${d.stats.doneToday} done, ${d.today.length} still open${late ? `, ${late} late` : ""}.`,
    "",
    s.dials === 0 && s.convos === 0 && s.booked === 0 && s.cashCents === 0
      ? "Nothing logged. If you worked, tap the counters now so the week is honest."
      : "If the numbers are off, tap the counters before midnight.",
    "",
    `${appUrl()}/hub`,
  ];
  return deliver("Evening: close the day", lines.join("\n"), `${appUrl()}/hub`);
}

/** Sunday 9pm: last week's scorecard, and next week's three drafted from what is still open. */
export async function weeklyScorecard() {
  const d = await getHubData({ lean: true });
  const tz = d.tz;
  const now = new Date();
  const thisWeek = weekStartKey(now, tz);
  const nextWeek = addDaysKey(thisWeek, 7);

  const start = utcDateFromKey(thisWeek);
  const end = utcDateFromKey(nextWeek);
  const [entries, done, calls] = await Promise.all([
    prisma.scoreEntry.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.task.count({ where: { status: TaskStatus.COMPLETED, completedAt: { gte: start, lt: end } } }),
    prisma.inboxItem.count({ where: { agent: "fathom", createdAt: { gte: start, lt: end } } }),
  ]);
  const sum = entries.reduce(
    (a, e) => ({ dials: a.dials + e.dials, convos: a.convos + e.convos, booked: a.booked + e.booked, cash: a.cash + e.cashCents }),
    { dials: 0, convos: 0, booked: 0, cash: 0 }
  );
  const outcomes = d.week.outcomes;
  const hit = outcomes.filter((o) => o.done);
  const missed = outcomes.filter((o) => !o.done);

  // Draft next week: carry the missed outcomes, then fill from the biggest open items.
  const carry = missed.map((o) => o.text);
  const openTitles = d.today.filter((t) => !t.overdue).map((t) => t.title);
  const draft = [...carry, ...openTitles].filter((t, i, a) => a.indexOf(t) === i).slice(0, 3);
  const plan = await ensureWeekPlan(nextWeek);
  const existing = normalizeOutcomes(plan.outcomes);
  if (existing.length === 0 && draft.length) {
    await prisma.weekPlan.update({ where: { weekStart: utcDateFromKey(nextWeek) }, data: { outcomes: draft.map((text) => ({ text, done: false })) } });
  }

  const gap = Math.max(0, d.week.goal.targetCents - d.week.goal.collectedCents);
  const weeksLeft = Math.max(1, Math.ceil(d.week.goal.daysLeft / 7));
  const lines = [
    `Week of ${thisWeek}`,
    "",
    `Outcomes: ${hit.length} of ${outcomes.length}`,
    ...hit.map((o) => `  hit: ${o.text}`),
    ...missed.map((o) => `  missed: ${o.text}`),
    "",
    `Numbers: ${sum.dials} dials, ${sum.convos} convos, ${sum.booked} booked, ${formatMoney(sum.cash)} cash.`,
    `${done} tasks done, ${calls} recorded calls.`,
    "",
    `Cash gap to Dec 31: ${formatMoney(gap)}. That is ${formatMoney(Math.ceil(gap / weeksLeft / 100) * 100)} a week for ${weeksLeft} weeks.`,
    "",
    draft.length ? "Next week's three, drafted (edit them in This week):" : "Next week has no outcomes yet. Set three.",
    ...draft.map((t, i) => `${i + 1}. ${t}`),
    "",
    `${appUrl()}/hub`,
  ];
  return deliver("Sunday scorecard", lines.join("\n"), `${appUrl()}/hub`);
}
