// Runs against the local database (DATABASE_URL). Every row made here is removed at the end.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { TaskStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { zonedTime } from "../day";
import {
  ActionError,
  addEvent,
  addTask,
  appendPersonNote,
  completeTask,
  deleteEvent,
  moveEvent,
  planMove,
  spokenTime,
  undoAction,
  whenLabel,
} from "../jarvis/actions";
import { runTool } from "../jarvis/tools";

const TZ = "America/New_York";
const NOW = zonedTime(2026, 11, 12, 10, 0, TZ); // Thu Nov 12 2026, 10am
const ctx = { tz: TZ, now: NOW };
const TAG = `jvtest-${process.pid}`;

// The database tests need DATABASE_URL (npm test runs without one unless it is exported).
const db = process.env.DATABASE_URL ? {} : { skip: "DATABASE_URL is not set" };

const made = { events: new Set<string>(), tasks: new Set<string>(), people: new Set<string>(), actions: new Set<string>() };

after(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.calendarEvent.deleteMany({ where: { OR: [{ id: { in: [...made.events] } }, { title: { startsWith: TAG } }] } });
  await prisma.task.deleteMany({ where: { OR: [{ id: { in: [...made.tasks] } }, { title: { startsWith: TAG } }] } });
  await prisma.person.deleteMany({ where: { id: { in: [...made.people] } } });
  await prisma.jarvisAction.deleteMany({ where: { OR: [{ id: { in: [...made.actions] } }, { summary: { contains: TAG } }] } });
  await prisma.$disconnect();
});

async function track<T extends { id: string }>(p: Promise<T>) {
  const r = await p;
  made.actions.add(r.id);
  return r;
}

async function eventIdOf(actionId: string) {
  const row = await prisma.jarvisAction.findUniqueOrThrow({ where: { id: actionId } });
  const id = (row.undo as { eventId?: string }).eventId!;
  made.events.add(id);
  return id;
}

// ── Pure parts ───────────────────────────────────────────────────────────────

test("spoken times", () => {
  assert.equal(spokenTime("13:00"), "1pm");
  assert.equal(spokenTime("13:30"), "1:30pm");
  assert.equal(spokenTime("00:15"), "12:15am");
  assert.equal(spokenTime("12:00"), "12pm");
});

test("a move keeps the event's length and the day when only the time changes", () => {
  const ev = { date: zonedTime(2026, 11, 13, 13, 0, TZ), startTime: "13:00", endTime: "14:00", allDay: false };
  const next = planMove(ev, { startTime: "15:30" }, TZ);
  assert.equal(next.startTime, "15:30");
  assert.equal(next.endTime, "16:30");
  assert.equal(next.date.getTime(), zonedTime(2026, 11, 13, 15, 30, TZ).getTime());
  const day = planMove(ev, { date: "2026-11-16" }, TZ);
  assert.equal(whenLabel(day, TZ), "Mon Nov 16 at 1pm");
  assert.equal(day.endTime, "14:00");
});

// ── Against the database ─────────────────────────────────────────────────────

test("add an event, then undo it: no row is left", db, async () => {
  const a = await track(addEvent({ title: `${TAG} Lunch with Omar`, date: "2026-11-13", startTime: "13:00" }, ctx));
  assert.equal(a.kind, "add_event");
  assert.equal(a.summary, `Added ${TAG} Lunch with Omar, Fri Nov 13 at 1pm`);
  const id = await eventIdOf(a.id);
  const ev = await prisma.calendarEvent.findUniqueOrThrow({ where: { id } });
  assert.equal(ev.date.getTime(), zonedTime(2026, 11, 13, 13, 0, TZ).getTime());
  assert.equal(ev.allDay, false);

  const u = await undoAction(a.id, ctx);
  assert.equal(u.summary, `Undid: ${a.summary}`);
  assert.equal(await prisma.calendarEvent.count({ where: { id } }), 0);
  const row = await prisma.jarvisAction.findUniqueOrThrow({ where: { id: a.id } });
  assert.ok(row.undoneAt);
});

test("a second undo of the same action is refused", db, async () => {
  const a = await track(addEvent({ title: `${TAG} Twice`, date: "2026-11-14" }, ctx));
  await eventIdOf(a.id);
  await undoAction(a.id, ctx);
  await assert.rejects(() => undoAction(a.id, ctx), (e: unknown) => e instanceof ActionError && /already undone/.test(e.message));
});

test("move an event, then undo: date and times come back", db, async () => {
  const a = await track(addEvent({ title: `${TAG} Call`, date: "2026-11-13", startTime: "09:00", endTime: "09:45" }, ctx));
  const id = await eventIdOf(a.id);
  const before = await prisma.calendarEvent.findUniqueOrThrow({ where: { id } });

  const m = await track(moveEvent({ eventId: id, date: "2026-11-17", startTime: "16:00" }, ctx));
  assert.equal(m.summary, `Moved ${TAG} Call to Tue Nov 17 at 4pm`);
  const moved = await prisma.calendarEvent.findUniqueOrThrow({ where: { id } });
  assert.equal(moved.startTime, "16:00");
  assert.equal(moved.endTime, "16:45");
  assert.equal(moved.date.getTime(), zonedTime(2026, 11, 17, 16, 0, TZ).getTime());

  await undoAction(m.id, ctx);
  const back = await prisma.calendarEvent.findUniqueOrThrow({ where: { id } });
  assert.equal(back.date.getTime(), before.date.getTime());
  assert.equal(back.startTime, "09:00");
  assert.equal(back.endTime, "09:45");
  assert.equal(back.allDay, false);
});

test("delete an event, then undo: the same row is back", db, async () => {
  const person = await prisma.person.create({ data: { name: `${TAG} Omar` } });
  made.people.add(person.id);
  const a = await track(addEvent({ title: `${TAG} Dinner`, date: "2026-11-15", startTime: "19:00", location: "Home", notes: "bring dessert", person: person.name }, ctx));
  const id = await eventIdOf(a.id);
  const before = await prisma.calendarEvent.findUniqueOrThrow({ where: { id } });
  assert.equal(before.personId, person.id);

  const d = await track(deleteEvent({ eventId: id }, ctx));
  assert.equal(d.summary, `Deleted ${TAG} Dinner, Sun Nov 15 at 7pm`);
  assert.equal(await prisma.calendarEvent.count({ where: { id } }), 0);

  await undoAction(d.id, ctx);
  const back = await prisma.calendarEvent.findUniqueOrThrow({ where: { id } });
  const strip = ({ updatedAt, ...rest }: typeof back) => (void updatedAt, rest);
  assert.deepEqual(strip(back), strip(before));
});

test("locked events (Calendly, Fathom, feed) are never moved or deleted", db, async () => {
  for (const source of ["calendly", "fathom", "feed"]) {
    const ev = await prisma.calendarEvent.create({
      data: { title: `${TAG} Booked ${source}`, date: zonedTime(2026, 11, 13, 11, 0, TZ), startTime: "11:00", source, externalId: `${source}:${TAG}` },
    });
    made.events.add(ev.id);
    await assert.rejects(() => moveEvent({ eventId: ev.id, startTime: "15:00" }, ctx), (e: unknown) => e instanceof ActionError && /can't change it/.test(e.message));
    await assert.rejects(() => deleteEvent({ eventId: ev.id }, ctx), (e: unknown) => e instanceof ActionError && /can't change it/.test(e.message));
    const after = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } });
    assert.equal(after.startTime, "11:00");
    assert.equal(after.date.getTime(), ev.date.getTime());
    // Through the tool layer the refusal comes back as an error result, with no action row.
    const out = await runTool("delete_event", { eventId: ev.id }, ctx);
    assert.equal(out.isError, true);
    assert.equal(out.action, undefined);
  }
  assert.equal(await prisma.jarvisAction.count({ where: { summary: { contains: `${TAG} Booked` } } }), 0);
});

test("append to a person's notes, then undo: notes are as before", db, async () => {
  const person = await prisma.person.create({ data: { name: `${TAG} Sara Lee`, notes: "Met at the expo.\nLikes tea." } });
  made.people.add(person.id);
  const a = await track(appendPersonNote({ name: `${TAG} Sara Lee`, text: "Wants the proposal by Friday" }, ctx));
  assert.equal(a.summary, `Added to ${TAG} Sara Lee's notes: Wants the proposal by Friday`);
  const mid = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
  assert.equal(mid.notes, "Met at the expo.\nLikes tea.\n2026-11-12: Wants the proposal by Friday");

  await undoAction(a.id, ctx);
  const back = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
  assert.equal(back.notes, "Met at the expo.\nLikes tea.");
});

test("append to an unknown person changes nothing", db, async () => {
  const count = await prisma.jarvisAction.count();
  await assert.rejects(() => appendPersonNote({ name: `${TAG} Nobody Here`, text: "x" }, ctx), (e: unknown) => e instanceof ActionError && /couldn't find/.test(e.message));
  assert.equal(await prisma.jarvisAction.count(), count);
});

test("add a task, then undo: the task is gone", db, async () => {
  const a = await track(addTask({ title: `${TAG} Call the bank`, dueDate: "2026-11-13" }, ctx));
  assert.equal(a.summary, `Added task: ${TAG} Call the bank, due Fri Nov 13`);
  const row = await prisma.jarvisAction.findUniqueOrThrow({ where: { id: a.id } });
  const taskId = (row.undo as { taskId: string }).taskId;
  made.tasks.add(taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  assert.equal(task.dueDate?.getTime(), zonedTime(2026, 11, 13, 12, 0, TZ).getTime());
  assert.equal(task.pinnedToday, false);

  await undoAction(a.id, ctx);
  assert.equal(await prisma.task.count({ where: { id: taskId } }), 0);
});

test("finish a task, then undo: it is open again with its old state", db, async () => {
  const task = await prisma.task.create({ data: { title: `${TAG} Send invoice`, status: TaskStatus.IN_PROGRESS, startedAt: new Date("2026-11-10T15:00:00Z"), pinnedToday: true } });
  made.tasks.add(task.id);
  const c = await track(completeTask({ title: `${TAG} Send invoice` }, ctx));
  assert.equal(c.summary, `Marked done: ${TAG} Send invoice`);
  const done = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(done.status, TaskStatus.COMPLETED);
  assert.ok(done.completedAt);

  await undoAction(c.id, ctx);
  const back = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(back.status, TaskStatus.IN_PROGRESS);
  assert.equal(back.completedAt, null);
  assert.equal(back.startedAt?.toISOString(), "2026-11-10T15:00:00.000Z");
  assert.equal(back.pinnedToday, true);
  await assert.rejects(() => undoAction(c.id, ctx), ActionError);
});

test("runTool rejects bad dates before touching anything", db, async () => {
  const out = await runTool("add_event", { title: `${TAG} Bad`, date: "friday" }, ctx);
  assert.equal(out.isError, true);
  assert.equal(await prisma.calendarEvent.count({ where: { title: `${TAG} Bad` } }), 0);
  const none = await runTool("send_email", {}, ctx);
  assert.equal(none.isError, true);
});
