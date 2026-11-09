import type { HubPayload } from "@/lib/hub-types";
import type { Task } from "@/lib/types";
import { dayKey } from "@/lib/day";

/** The one thing to do right now. Pure: same payload and clock, same answer.
 * Order: a late task, a call about to start, a question from an agent, someone you
 * owe a nudge, your top pinned task, else pick an outcome. Dialing lives in the agency
 * dialer, not here. */

export type NextAction =
  | { kind: "late"; task: Task; title: string; detail: string }
  | { kind: "event"; eventId: string; title: string; detail: string }
  | { kind: "question"; inboxId: string; title: string; detail: string }
  | { kind: "nudge"; personId: string; personName: string; title: string; detail: string }
  | { kind: "task"; task: Task; title: string; detail: string }
  | { kind: "stale"; task: Task; title: string; detail: string }
  | { kind: "outcome"; title: string; detail: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A task whose title names a date that has passed ("through Oct 30 2026") is stale: the
 * moment is gone, so it is a Done-or-Drop, not a to-do. Returns how many days ago. */
export function staleDays(task: Pick<Task, "title" | "dueDate">, now: Date): number | null {
  const m = task.title.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  const day = Number(m[2]);
  const year = m[3] ? Number(m[3]) : now.getFullYear();
  const at = new Date(year, month, day, 23, 59, 59);
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  return days >= 1 ? days : null;
}

/** Kept for callers that show the target; the live value is d.policy.dialTarget. */
export const DIAL_TARGET = 90;

function clockToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function nextAction(d: HubPayload, now: Date): NextAction {
  const live = d.today.filter((t) => staleDays(t, now) === null);
  const stale = d.today.filter((t) => staleDays(t, now) !== null);
  const late = live.filter((t) => t.overdue).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
  if (late) {
    const days = Math.max(1, Math.round((now.getTime() - new Date(late.dueDate!).getTime()) / 86_400_000));
    return { kind: "late", task: late, title: late.title, detail: `${days} day${days === 1 ? "" : "s"} late. Finish it or drop it.` };
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const soon = d.upNext.find((e) => {
    if (dayKey(new Date(e.date), d.tz) !== d.todayKey || !e.startTime) return false;
    const start = clockToMinutes(e.startTime);
    return start - nowMin >= -5 && start - nowMin <= d.policy.eventLeadMin;
  });
  if (soon?.startTime) {
    const mins = clockToMinutes(soon.startTime) - nowMin;
    return {
      kind: "event",
      eventId: soon.id,
      title: soon.title,
      detail: mins <= 0 ? "Starting now." : `In ${mins} min${soon.person ? ` with ${soon.person.name}` : ""}. Get ready.`,
    };
  }

  const q = d.inbox.find((i) => i.kind === "question");
  if (q) return { kind: "question", inboxId: q.id, title: q.title, detail: `${q.agent} is waiting on your answer.` };

  const todayMs = now.getTime();
  const owedCutoff = todayMs - d.policy.nudgeAfterDays * 86_400_000;
  const owed = d.waitingOn.find((g) => g.tasks.some((t) => (t.followUpDate ? new Date(t.followUpDate).getTime() <= todayMs - 86_400_000 : (t.waitingAt ? new Date(t.waitingAt).getTime() : 0) <= owedCutoff)));
  if (owed) {
    const t = owed.tasks[0];
    return {
      kind: "nudge",
      personId: owed.person.id,
      personName: owed.person.name,
      title: `Nudge ${owed.person.name}`,
      detail: `You are still waiting on "${t.title}". Send a nudge.`,
    };
  }

  // The brain's order for today wins when it has one; otherwise pinned, then first.
  const ranked = d.policy.rankingDay === d.todayKey ? d.policy.ranking.map((r) => live.find((t) => t.id === r.taskId)).find(Boolean) : undefined;
  const top = ranked ?? live.find((t) => t.pinnedToday) ?? live[0];
  if (ranked) {
    const why = d.policy.ranking.find((r) => r.taskId === ranked.id)?.why;
    return { kind: "task", task: ranked, title: ranked.title, detail: why || (ranked.people[0] ? `With ${ranked.people[0].name}.` : "Next up.") };
  }
  if (top) return { kind: "task", task: top, title: top.title, detail: top.people[0] ? `With ${top.people[0].name}.` : "Next up." };

  if (stale[0]) {
    const days = staleDays(stale[0], now) ?? 0;
    return { kind: "stale", task: stale[0], title: stale[0].title, detail: `That date was ${days} day${days === 1 ? "" : "s"} ago. Mark it done or drop it.` };
  }

  const open = d.week.outcomes.find((o) => !o.done);
  return {
    kind: "outcome",
    title: open ? open.text : "Nothing due.",
    detail: open ? "Nothing on the calendar. Work on this goal." : "Pick one goal for the week and start.",
  };
}
