// Jarvis actions. Each one makes a change, writes a JarvisAction row with a plain summary and an
// undo payload, and returns { id, kind, summary }. undoAction reverses one row exactly once.
// Locked events (Calendly, Fathom, calendar feeds) are never moved or deleted.
import { Prisma, TaskStatus, type CalendarEvent, type Task } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayKey, partsInTz, zonedTime } from "@/lib/day";
import { isLockedSource } from "@/lib/calendar-utils";
import { deleteEventFromGoogle, pushEventToGoogle } from "@/lib/google";
import { createNote, deleteNote } from "@/lib/notes";

export type ActionKind = "add_event" | "move_event" | "delete_event" | "add_note" | "append_person_note" | "add_task" | "complete_task";
export type ActionResult = { id: string; kind: ActionKind; summary: string };
export type ActionCtx = { tz: string; now?: Date };

/** A refusal or a problem the user should hear about. The message is said out loud. */
export class ActionError extends Error {}

// ── Pure helpers ─────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(key.trim());
  if (!m) throw new ActionError(`I need a date like 2026-11-13, not "${key}".`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw new ActionError(`${key} is not a real date.`);
  return { y, m: mo, d };
}

export function parseClock(time: string): { h: number; mi: number } {
  const m = TIME_RE.exec(time.trim());
  if (!m) throw new ActionError(`I need a time like 13:00, not "${time}".`);
  return { h: Number(m[1]), mi: Number(m[2]) };
}

/** The stored instant for an event: the start time in tz, or noon for an all-day event. */
export function eventInstant(dateKey: string, time: string | null | undefined, tz: string): Date {
  const { y, m, d } = parseDateKey(dateKey);
  const { h, mi } = time ? parseClock(time) : { h: 12, mi: 0 };
  return zonedTime(y, m, d, h, mi, tz);
}

/** Tasks are due at noon on their day, same as the Tasks page. */
export function dueInstant(dateKey: string, tz: string): Date {
  return eventInstant(dateKey, null, tz);
}

/** "13:00" -> "1pm", "13:30" -> "1:30pm", "00:15" -> "12:15am". */
export function spokenTime(hhmm: string): string {
  const { h, mi } = parseClock(hhmm);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mi === 0 ? `${h12}${suffix}` : `${h12}:${String(mi).padStart(2, "0")}${suffix}`;
}

/** "Fri Nov 13" for the day the instant falls on in tz. */
export function dayLabel(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(date).replace(",", "");
}

/** "Fri Nov 13 at 1pm", or "Fri Nov 13" for an all-day event. */
export function whenLabel(ev: { date: Date; startTime: string | null; allDay: boolean }, tz: string): string {
  const day = dayLabel(ev.date, tz);
  return !ev.allDay && ev.startTime ? `${day} at ${spokenTime(ev.startTime)}` : day;
}

function addMinutes(hhmm: string, mins: number): string {
  const { h, mi } = parseClock(hhmm);
  const t = Math.max(0, Math.min(23 * 60 + 59, h * 60 + mi + mins));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function minutesOf(hhmm: string): number {
  const { h, mi } = parseClock(hhmm);
  return h * 60 + mi;
}

/** New date and times for a move. Keeps the length of a timed event when only the start moves. */
export function planMove(
  ev: { date: Date; startTime: string | null; endTime: string | null; allDay: boolean },
  change: { date?: string; startTime?: string; endTime?: string },
  tz: string,
): { date: Date; startTime: string | null; endTime: string | null; allDay: boolean } {
  if (!change.date && !change.startTime && !change.endTime) throw new ActionError("Tell me the new day or time.");
  const key = change.date ?? dayKey(ev.date, tz);
  const startTime = change.startTime ?? (ev.allDay ? null : ev.startTime);
  let endTime: string | null = change.endTime ?? null;
  if (!change.endTime && change.startTime && ev.startTime && ev.endTime && !ev.allDay) {
    const length = minutesOf(ev.endTime) - minutesOf(ev.startTime);
    if (length > 0) endTime = addMinutes(change.startTime, length);
  } else if (!change.endTime && !change.startTime) {
    endTime = ev.allDay ? null : ev.endTime;
  }
  if (!startTime) endTime = null;
  if (startTime && endTime && minutesOf(endTime) <= minutesOf(startTime)) endTime = null;
  return { date: eventInstant(key, startTime, tz), startTime, endTime, allDay: !startTime };
}

/** The line appended to a person's notes: "2026-11-12: text". */
export function datedLine(text: string, now: Date, tz: string): string {
  return `${dayKey(now, tz)}: ${text.trim().replace(/\s+/g, " ")}`;
}

export function appendLine(notes: string | null, line: string): string {
  const base = (notes ?? "").replace(/\s+$/, "");
  return base ? `${base}\n${line}` : line;
}

/** Takes one appended line back out of the notes. Null when the line is gone. */
export function removeLine(notes: string | null, line: string): string | null {
  const lines = (notes ?? "").split("\n");
  const i = lines.lastIndexOf(line);
  if (i < 0) return null;
  lines.splice(i, 1);
  return lines.join("\n");
}

function clip(text: string, max = 60): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

// ── Undo payloads ────────────────────────────────────────────────────────────

/** Every column of an event, as JSON. Used to put a deleted or moved event back. */
type EventSnapshot = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  categoryId: string | null;
  taskId: string | null;
  personId: string | null;
  source: string | null;
  externalId: string | null;
  recordingUrl: string | null;
  isSeed: boolean;
  createdAt: string;
};

type TaskSnapshot = {
  status: TaskStatus;
  startedAt: string | null;
  waitingAt: string | null;
  completedAt: string | null;
  followUpRequired: boolean;
  pinnedToday: boolean;
};

export type UndoPayload =
  | { type: "delete_event"; eventId: string }
  | { type: "restore_event_time"; eventId: string; before: Pick<EventSnapshot, "date" | "startTime" | "endTime" | "allDay"> }
  | { type: "recreate_event"; row: EventSnapshot; googleDeleted: boolean }
  | { type: "delete_note"; noteId: string }
  | { type: "restore_person_notes"; personId: string; before: string | null; after: string; line: string }
  | { type: "delete_task"; taskId: string }
  | { type: "reopen_task"; taskId: string; before: TaskSnapshot };

function snapshotEvent(e: CalendarEvent): EventSnapshot {
  return {
    id: e.id,
    title: e.title,
    date: e.date.toISOString(),
    startTime: e.startTime,
    endTime: e.endTime,
    allDay: e.allDay,
    location: e.location,
    notes: e.notes,
    categoryId: e.categoryId,
    taskId: e.taskId,
    personId: e.personId,
    source: e.source,
    externalId: e.externalId,
    recordingUrl: e.recordingUrl,
    isSeed: e.isSeed,
    createdAt: e.createdAt.toISOString(),
  };
}

function snapshotTask(t: Task): TaskSnapshot {
  return {
    status: t.status,
    startedAt: t.startedAt?.toISOString() ?? null,
    waitingAt: t.waitingAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    followUpRequired: t.followUpRequired,
    pinnedToday: t.pinnedToday,
  };
}

const asDate = (s: string | null) => (s ? new Date(s) : null);

async function record(kind: ActionKind, summary: string, undo: UndoPayload): Promise<ActionResult> {
  const row = await prisma.jarvisAction.create({ data: { kind, summary, undo: undo as unknown as Prisma.InputJsonValue } });
  return { id: row.id, kind, summary };
}

/** Mirrors an event to Google like the calendar routes do. Skipped is fine; the local save stands. */
async function mirrorToGoogle(ev: CalendarEvent, tz: string): Promise<CalendarEvent> {
  if (isLockedSource(ev.source)) return ev;
  const pushed = await pushEventToGoogle(ev, tz);
  if ("externalId" in pushed && !ev.externalId) {
    return prisma.calendarEvent.update({ where: { id: ev.id }, data: { externalId: pushed.externalId, source: "google" } });
  }
  return ev;
}

// ── Lookups ──────────────────────────────────────────────────────────────────

/** Finds one person by name: exact (any case), then a unique first-name or partial match. */
export async function findPersonByName(name: string) {
  const q = name.trim();
  if (!q) return null;
  const exact = await prisma.person.findFirst({ where: { name: { equals: q, mode: "insensitive" } } });
  if (exact) return exact;
  const partial = await prisma.person.findMany({ where: { name: { contains: q, mode: "insensitive" } }, take: 5 });
  if (partial.length === 1) return partial[0];
  const first = partial.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === q.toLowerCase());
  return first.length === 1 ? first[0] : null;
}

async function findEventOrThrow(eventId: string) {
  const ev = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!ev) throw new ActionError("I couldn't find that event. It may have been removed.");
  return ev;
}

function refuseLocked(ev: CalendarEvent) {
  if (!isLockedSource(ev.source)) return;
  const owner = ev.source === "calendly" ? "Calendly" : ev.source === "fathom" ? "Fathom" : "a calendar feed";
  throw new ActionError(`${ev.title} comes from ${owner}, so I can't change it here. Change it in ${owner === "a calendar feed" ? "that calendar" : owner}.`);
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function addEvent(
  input: { title: string; date: string; startTime?: string | null; endTime?: string | null; location?: string | null; notes?: string | null; person?: string | null },
  ctx: ActionCtx,
): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) throw new ActionError("The event needs a name.");
  const startTime = input.startTime || null;
  let endTime = startTime ? input.endTime || null : null;
  if (startTime && endTime && minutesOf(endTime) <= minutesOf(startTime)) endTime = null;
  const date = eventInstant(input.date, startTime, ctx.tz);
  const person = input.person ? await findPersonByName(input.person) : null;

  const created = await prisma.calendarEvent.create({
    data: {
      title: title.slice(0, 200),
      date,
      startTime,
      endTime,
      allDay: !startTime,
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
      personId: person?.id ?? null,
    },
  });
  const ev = await mirrorToGoogle(created, ctx.tz);
  return record("add_event", `Added ${ev.title}, ${whenLabel(ev, ctx.tz)}`, { type: "delete_event", eventId: ev.id });
}

export async function moveEvent(input: { eventId: string; date?: string; startTime?: string; endTime?: string }, ctx: ActionCtx): Promise<ActionResult> {
  const ev = await findEventOrThrow(input.eventId);
  refuseLocked(ev);
  const next = planMove(ev, input, ctx.tz);
  const before = { date: ev.date.toISOString(), startTime: ev.startTime, endTime: ev.endTime, allDay: ev.allDay };
  const updated = await prisma.calendarEvent.update({ where: { id: ev.id }, data: next });
  const synced = await mirrorToGoogle(updated, ctx.tz);
  return record("move_event", `Moved ${synced.title} to ${whenLabel(synced, ctx.tz)}`, { type: "restore_event_time", eventId: ev.id, before });
}

export async function deleteEvent(input: { eventId: string }, ctx: ActionCtx): Promise<ActionResult> {
  const ev = await findEventOrThrow(input.eventId);
  refuseLocked(ev);
  const removed = await deleteEventFromGoogle(ev.externalId);
  if ("error" in removed) throw new ActionError(`Google wouldn't delete it: ${removed.error}`);
  await prisma.calendarEvent.delete({ where: { id: ev.id } });
  return record("delete_event", `Deleted ${ev.title}, ${whenLabel(ev, ctx.tz)}`, { type: "recreate_event", row: snapshotEvent(ev), googleDeleted: "ok" in removed });
}

export async function addNote(input: { title?: string; body: string }): Promise<ActionResult> {
  const body = input.body.trim();
  if (!body) throw new ActionError("The note is empty.");
  const note = await createNote({ title: input.title?.trim() || "", body });
  const label = note.title || clip(body.split("\n")[0], 50);
  return record("add_note", `Saved a note: ${label}`, { type: "delete_note", noteId: note.id });
}

export async function appendPersonNote(input: { name: string; text: string }, ctx: ActionCtx): Promise<ActionResult> {
  const text = input.text.trim();
  if (!text) throw new ActionError("There's nothing to add.");
  const person = await findPersonByName(input.name);
  if (!person) throw new ActionError(`I couldn't find ${input.name.trim()} in People, so I didn't add anything.`);
  const line = datedLine(text, ctx.now ?? new Date(), ctx.tz);
  const after = appendLine(person.notes, line);
  await prisma.person.update({ where: { id: person.id }, data: { notes: after } });
  return record("append_person_note", `Added to ${person.name}'s notes: ${clip(text)}`, { type: "restore_person_notes", personId: person.id, before: person.notes, after, line });
}

export async function addTask(input: { title: string; dueDate?: string | null; dueTime?: string | null; person?: string | null }, ctx: ActionCtx): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) throw new ActionError("The task needs a name.");
  const dueDate = input.dueDate ? dueInstant(input.dueDate, ctx.tz) : null;
  const dueTime = dueDate && input.dueTime ? (parseClock(input.dueTime), input.dueTime) : null;
  const person = input.person ? await findPersonByName(input.person) : null;
  const last = await prisma.task.findFirst({ orderBy: { position: "desc" }, select: { position: true } });

  const task = await prisma.task.create({
    data: {
      title: title.slice(0, 300),
      dueDate,
      dueTime,
      pinnedToday: !dueDate,
      position: (last?.position ?? 0) + 1000,
      people: person ? { create: [{ personId: person.id }] } : undefined,
    },
  });
  await prisma.taskEvent.create({ data: { taskId: task.id, type: "created", toValue: task.status, actor: "ai" } });
  const due = dueDate ? `, due ${dayLabel(dueDate, ctx.tz)}${dueTime ? ` at ${spokenTime(dueTime)}` : ""}` : "";
  return record("add_task", `Added task: ${task.title}${due}`, { type: "delete_task", taskId: task.id });
}

/** Finds an open task by id, or by title when there is exactly one good match. */
export async function findOpenTask(ref: { taskId?: string; title?: string }) {
  if (ref.taskId) {
    const t = await prisma.task.findUnique({ where: { id: ref.taskId } });
    if (!t) throw new ActionError("I couldn't find that task.");
    return t;
  }
  const q = ref.title?.trim();
  if (!q) throw new ActionError("Which task?");
  const open = { status: { not: TaskStatus.COMPLETED } };
  const exact = await prisma.task.findMany({ where: { ...open, title: { equals: q, mode: "insensitive" } }, take: 2 });
  if (exact.length === 1) return exact[0];
  const partial = await prisma.task.findMany({ where: { ...open, title: { contains: q, mode: "insensitive" } }, take: 3 });
  if (partial.length === 1) return partial[0];
  if (partial.length === 0) throw new ActionError(`I couldn't find an open task called ${q}.`);
  throw new ActionError(`More than one open task matches ${q}: ${partial.map((t) => t.title).join(", ")}. Which one?`);
}

export async function completeTask(input: { taskId?: string; title?: string }, ctx: ActionCtx): Promise<ActionResult> {
  const task = await findOpenTask(input);
  if (task.status === TaskStatus.COMPLETED) throw new ActionError(`${task.title} is already done.`);
  const now = ctx.now ?? new Date();
  await prisma.task.update({
    where: { id: task.id },
    data: { status: TaskStatus.COMPLETED, completedAt: now, startedAt: task.startedAt ?? now, followUpRequired: false },
  });
  await prisma.taskEvent.create({ data: { taskId: task.id, type: "status_changed", fromValue: task.status, toValue: TaskStatus.COMPLETED, actor: "ai" } });
  return record("complete_task", `Marked done: ${task.title}`, { type: "reopen_task", taskId: task.id, before: snapshotTask(task) });
}

// ── Undo ─────────────────────────────────────────────────────────────────────

async function applyUndo(undo: UndoPayload, tz: string): Promise<void> {
  switch (undo.type) {
    case "delete_event": {
      const ev = await prisma.calendarEvent.findUnique({ where: { id: undo.eventId } });
      if (!ev) return; // already gone
      const removed = await deleteEventFromGoogle(ev.externalId);
      if ("error" in removed) throw new ActionError(`Google wouldn't delete it: ${removed.error}`);
      await prisma.calendarEvent.delete({ where: { id: ev.id } });
      return;
    }
    case "restore_event_time": {
      const ev = await prisma.calendarEvent.findUnique({ where: { id: undo.eventId } });
      if (!ev) throw new ActionError("That event is gone now, so there is nothing to move back.");
      const { date, startTime, endTime, allDay } = undo.before;
      const restored = await prisma.calendarEvent.update({ where: { id: ev.id }, data: { date: new Date(date), startTime, endTime, allDay } });
      await mirrorToGoogle(restored, tz);
      return;
    }
    case "recreate_event": {
      const r = undo.row;
      if (await prisma.calendarEvent.findUnique({ where: { id: r.id }, select: { id: true } })) return; // already back
      // Links that point at rows deleted since then are dropped instead of failing the undo.
      const [category, task, person] = await Promise.all([
        r.categoryId ? prisma.category.findUnique({ where: { id: r.categoryId }, select: { id: true } }) : null,
        r.taskId ? prisma.task.findUnique({ where: { id: r.taskId }, select: { id: true } }) : null,
        r.personId ? prisma.person.findUnique({ where: { id: r.personId }, select: { id: true } }) : null,
      ]);
      // When the Google copy was deleted, the old Google id is dead: send it again as a new event.
      const keepLink = !undo.googleDeleted;
      const externalTaken = keepLink && r.externalId ? await prisma.calendarEvent.findUnique({ where: { externalId: r.externalId }, select: { id: true } }) : null;
      const created = await prisma.calendarEvent.create({
        data: {
          id: r.id,
          title: r.title,
          date: new Date(r.date),
          startTime: r.startTime,
          endTime: r.endTime,
          allDay: r.allDay,
          location: r.location,
          notes: r.notes,
          categoryId: category?.id ?? null,
          taskId: task?.id ?? null,
          personId: person?.id ?? null,
          source: keepLink ? r.source : null,
          externalId: keepLink && !externalTaken ? r.externalId : null,
          recordingUrl: r.recordingUrl,
          isSeed: r.isSeed,
          createdAt: new Date(r.createdAt),
        },
      });
      if (undo.googleDeleted) await mirrorToGoogle(created, tz);
      return;
    }
    case "delete_note":
      await deleteNote(undo.noteId);
      return;
    case "restore_person_notes": {
      const p = await prisma.person.findUnique({ where: { id: undo.personId }, select: { notes: true } });
      if (!p) throw new ActionError("That person is gone now, so there is nothing to undo.");
      let notes: string | null;
      if ((p.notes ?? "") === undo.after) notes = undo.before;
      else {
        // Notes were edited since. Take out only the line Jarvis added.
        notes = removeLine(p.notes, undo.line);
        if (notes === null) throw new ActionError("That line is no longer in their notes.");
      }
      await prisma.person.update({ where: { id: undo.personId }, data: { notes } });
      return;
    }
    case "delete_task":
      await prisma.task.deleteMany({ where: { id: undo.taskId } });
      return;
    case "reopen_task": {
      const t = await prisma.task.findUnique({ where: { id: undo.taskId }, select: { id: true, status: true } });
      if (!t) throw new ActionError("That task is gone now, so I can't reopen it.");
      const b = undo.before;
      await prisma.task.update({
        where: { id: t.id },
        data: { status: b.status, startedAt: asDate(b.startedAt), waitingAt: asDate(b.waitingAt), completedAt: asDate(b.completedAt), followUpRequired: b.followUpRequired, pinnedToday: b.pinnedToday },
      });
      await prisma.taskEvent.create({ data: { taskId: t.id, type: "status_changed", fromValue: t.status, toValue: b.status, actor: "ai" } });
      return;
    }
  }
}

/** Reverses one action and marks it undone. Refuses a second undo of the same row. */
export async function undoAction(id: string, ctx: ActionCtx): Promise<{ id: string; kind: string; summary: string }> {
  const row = await prisma.jarvisAction.findUnique({ where: { id } });
  if (!row) throw new ActionError("I can't find that action.");
  if (row.undoneAt) throw new ActionError("That was already undone.");
  if (!row.undo || typeof row.undo !== "object") throw new ActionError("There is nothing to undo for that one.");

  // Claim the row first so two undo taps can't both run.
  const claimed = await prisma.jarvisAction.updateMany({ where: { id, undoneAt: null }, data: { undoneAt: new Date() } });
  if (claimed.count === 0) throw new ActionError("That was already undone.");
  try {
    await applyUndo(row.undo as unknown as UndoPayload, ctx.tz);
  } catch (err) {
    await prisma.jarvisAction.update({ where: { id }, data: { undoneAt: null } });
    throw err;
  }
  return { id, kind: row.kind, summary: `Undid: ${row.summary}` };
}

export async function recentActions(limit = 20) {
  const rows = await prisma.jarvisAction.findMany({ orderBy: { createdAt: "desc" }, take: limit, select: { id: true, kind: true, summary: true, createdAt: true, undoneAt: true } });
  return rows.map((r) => ({ id: r.id, kind: r.kind, summary: r.summary, createdAt: r.createdAt.toISOString(), undoneAt: r.undoneAt?.toISOString() ?? null }));
}

/** Today's date facts for the prompt, in tz. */
export function nowFacts(now: Date, tz: string) {
  const p = partsInTz(now, tz);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  const clock = `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
  return { today: dayKey(now, tz), weekday, time: clock, spoken: `${weekday} ${dayLabel(now, tz).split(" ").slice(1).join(" ")}, ${spokenTime(clock)}` };
}
