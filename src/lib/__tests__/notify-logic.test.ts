import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeTitle, describeChanges, dueReminders, unreadItems, whatsNew } from "@/lib/notify-logic";
import type { InboxItem } from "@/lib/hub-types";
import type { CalendarEvent, Task } from "@/lib/types";

const item = (id: string, createdAt: string, resolvedAt: string | null = null): InboxItem => ({
  id, agent: "fathom", kind: "update", title: `Item ${id}`, body: null, link: null, taskId: null, resolvedAt, createdAt,
});
const task = (id: string): Task => ({ id, title: `Task ${id}` } as unknown as Task);

test("unread = unresolved and newer than last seen", () => {
  const seen = Date.parse("2026-11-09T12:00:00Z");
  const items = [item("a", "2026-11-09T13:00:00Z"), item("b", "2026-11-09T11:00:00Z"), item("c", "2026-11-09T14:00:00Z", "2026-11-09T15:00:00Z")];
  assert.deepEqual(unreadItems(items, seen).map((i) => i.id), ["a"]);
  assert.equal(unreadItems(items, 0).length, 2);
});

test("whatsNew lists additions only", () => {
  const prev = { today: [task("1")], inbox: [item("x", "2026-11-09T10:00:00Z")] };
  const next = { today: [task("2")], inbox: [item("x", "2026-11-09T10:00:00Z"), item("y", "2026-11-09T10:05:00Z")] };
  assert.deepEqual(whatsNew(prev, next), [
    { kind: "task", title: "Task 2", href: "/tasks?highlight=2" },
    { kind: "feed", title: "Item y", href: "/hub#feed" },
  ]);
  assert.deepEqual(whatsNew(null, next), []);
});

test("describeChanges wording", () => {
  assert.equal(describeChanges([]), null);
  assert.equal(describeChanges([{ kind: "task", title: "Call Joaquin", href: "" }]), "New task: Call Joaquin");
  assert.equal(describeChanges([{ kind: "feed", title: "A", href: "" }]), "New in the feed: A");
  assert.equal(describeChanges([{ kind: "task", title: "A", href: "" }, { kind: "task", title: "B", href: "" }]), "2 new tasks for today.");
  assert.equal(describeChanges([{ kind: "task", title: "A", href: "" }, { kind: "feed", title: "B", href: "" }]), "2 new things: 1 task, 1 in the feed.");
});

test("dueReminders: timed events today within 10 min, once each", () => {
  const now = new Date("2026-11-09T14:00:00"); // local
  const ev = (id: string, startTime: string | null, date = "2026-11-09T05:00:00.000Z"): CalendarEvent => ({ id, title: `Ev ${id}`, startTime, date } as unknown as CalendarEvent);
  const announced = new Set<string>();
  const key = () => "2026-11-09";
  const due = dueReminders([ev("soon", "14:08"), ev("later", "14:30"), ev("past", "13:50"), ev("allday", null)], "2026-11-09", now, announced, key);
  assert.deepEqual(due, [{ id: "soon", title: "Ev soon", minutes: 8 }]);
  announced.add("soon");
  assert.deepEqual(dueReminders([ev("soon", "14:08")], "2026-11-09", now, announced, key), []);
  assert.deepEqual(dueReminders([ev("other", "14:05")], "2026-11-10", now, announced, key), []);
});

test("badgeTitle", () => {
  assert.equal(badgeTitle("abdi's os", 0), "abdi's os");
  assert.equal(badgeTitle("abdi's os", 3), "(3) abdi's os");
});
