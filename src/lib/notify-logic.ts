import type { HubPayload, InboxItem } from "@/lib/hub-types";
import type { CalendarEvent, Task } from "@/lib/types";

/** Pure rules behind the bell and the "what's new" toasts. No browser APIs here, so they
 * run in node:test. */

/** Unresolved feed items newer than the last time the bell was opened. */
export function unreadItems(inbox: InboxItem[], seenAt: number) {
  return inbox.filter((i) => !i.resolvedAt && new Date(i.createdAt).getTime() > seenAt);
}

export type Change = { kind: "task" | "feed"; title: string; href: string };

/** What a poll brought in that the previous snapshot did not have. Ignores removals: those
 * are things Abdi did himself. */
export function whatsNew(prev: Pick<HubPayload, "today" | "inbox"> | null, next: Pick<HubPayload, "today" | "inbox">): Change[] {
  if (!prev) return [];
  const hadTask = new Set(prev.today.map((t) => t.id));
  const hadItem = new Set(prev.inbox.map((i) => i.id));
  const out: Change[] = [];
  for (const t of next.today) if (!hadTask.has(t.id)) out.push({ kind: "task", title: t.title, href: `/tasks?highlight=${t.id}` });
  for (const i of next.inbox) if (!hadItem.has(i.id)) out.push({ kind: "feed", title: i.title, href: "/hub#feed" });
  return out;
}

/** One line for the toast: "New task: Send Joaquin the deck" or "3 new things. See the feed." */
export function describeChanges(changes: Change[]): string | null {
  if (changes.length === 0) return null;
  if (changes.length === 1) return `${changes[0].kind === "task" ? "New task" : "New in the feed"}: ${changes[0].title}`;
  const tasks = changes.filter((c) => c.kind === "task").length;
  if (tasks === changes.length) return `${tasks} new tasks for today.`;
  if (tasks === 0) return `${changes.length} new in the feed.`;
  return `${changes.length} new things: ${tasks} task${tasks === 1 ? "" : "s"}, ${changes.length - tasks} in the feed.`;
}

export const REMIND_MINUTES = 10;

/** Events starting within the next REMIND_MINUTES that have not been announced yet
 * (`announced` holds event ids). Only timed events on today's date count. */
export function dueReminders(events: CalendarEvent[], todayKey: string, now: Date, announced: Set<string>, dayKeyOf: (d: Date) => string) {
  const out: { id: string; title: string; minutes: number }[] = [];
  for (const e of events) {
    if (!e.startTime || announced.has(e.id)) continue;
    if (dayKeyOf(new Date(e.date)) !== todayKey) continue;
    const [h, m] = e.startTime.split(":").map(Number);
    const at = new Date(now);
    at.setHours(h, m, 0, 0);
    const minutes = Math.round((at.getTime() - now.getTime()) / 60000);
    if (minutes >= 0 && minutes <= REMIND_MINUTES) out.push({ id: e.id, title: e.title, minutes });
  }
  return out;
}

/** The tab title and the icon badge share this. */
export function badgeTitle(base: string, unread: number) {
  return unread > 0 ? `(${unread}) ${base}` : base;
}

export type { Task };
