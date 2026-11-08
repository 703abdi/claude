import type { HubPayload } from "@/lib/hub-types";
import type { Task } from "@/lib/types";
import { dayKey } from "@/lib/day";

/** The one thing to do right now. Pure: same payload and clock, same answer.
 * Order: a late task, a call about to start, a question from an agent, someone you
 * owe a nudge, dials behind pace on a work day, your top pinned task, else pick an outcome. */

export type NextAction =
  | { kind: "late"; task: Task; title: string; detail: string }
  | { kind: "event"; eventId: string; title: string; detail: string }
  | { kind: "question"; inboxId: string; title: string; detail: string }
  | { kind: "nudge"; personId: string; personName: string; title: string; detail: string }
  | { kind: "dial"; have: number; target: number; title: string; detail: string }
  | { kind: "task"; task: Task; title: string; detail: string }
  | { kind: "outcome"; title: string; detail: string };

export const DIAL_TARGET = 90;
const DIAL_START_HOUR = 10; // dials are behind pace only after this local hour
const EVENT_LEAD_MIN = 45;

function clockToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function nextAction(d: HubPayload, now: Date): NextAction {
  const late = d.today.filter((t) => t.overdue).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
  if (late) {
    const days = Math.max(1, Math.round((now.getTime() - new Date(late.dueDate!).getTime()) / 86_400_000));
    return { kind: "late", task: late, title: late.title, detail: `${days} day${days === 1 ? "" : "s"} late. Clear it or drop it.` };
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const soon = d.upNext.find((e) => {
    if (dayKey(new Date(e.date), d.tz) !== d.todayKey || !e.startTime) return false;
    const start = clockToMinutes(e.startTime);
    return start - nowMin >= -5 && start - nowMin <= EVENT_LEAD_MIN;
  });
  if (soon?.startTime) {
    const mins = clockToMinutes(soon.startTime) - nowMin;
    return {
      kind: "event",
      eventId: soon.id,
      title: soon.title,
      detail: mins <= 0 ? "Starting now." : `In ${mins} min${soon.person ? ` with ${soon.person.name}` : ""}. Prep for it.`,
    };
  }

  const q = d.inbox.find((i) => i.kind === "question");
  if (q) return { kind: "question", inboxId: q.id, title: q.title, detail: `${q.agent} is waiting on your answer.` };

  const todayMs = now.getTime();
  const owed = d.waitingOn.find((g) => g.tasks.some((t) => !t.followUpDate || new Date(t.followUpDate).getTime() <= todayMs - 86_400_000));
  if (owed) {
    const t = owed.tasks[0];
    return {
      kind: "nudge",
      personId: owed.person.id,
      personName: owed.person.name,
      title: `Nudge ${owed.person.name}`,
      detail: `Still waiting on "${t.title}".`,
    };
  }

  const dow = now.getDay();
  const workday = dow >= 1 && dow <= 5;
  const dials = d.week.scoreboard.today.dials;
  if (workday && now.getHours() >= DIAL_START_HOUR && dials < DIAL_TARGET) {
    return { kind: "dial", have: dials, target: DIAL_TARGET, title: "Dial.", detail: `${dials} of ${DIAL_TARGET} today. Cash comes from calls.` };
  }

  const top = d.today.find((t) => t.pinnedToday) ?? d.today[0];
  if (top) return { kind: "task", task: top, title: top.title, detail: top.people[0] ? `With ${top.people[0].name}.` : "Next up." };

  const open = d.week.outcomes.find((o) => !o.done);
  return {
    kind: "outcome",
    title: open ? open.text : "Clear day.",
    detail: open ? "Nothing scheduled. Move this outcome." : "Pick one outcome and start.",
  };
}
