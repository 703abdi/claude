// The tools Jarvis can use, as Anthropic tool definitions, and runTool which runs one call.
// Dates come in as "YYYY-MM-DD" and times as "HH:mm" (24h), in the user's timezone.
// There is no tool for email, texts or messages on purpose.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLockedSource } from "@/lib/calendar-utils";
import { addDaysKey, dayKey } from "@/lib/day";
import { searchMemory } from "@/lib/memory";
import {
  ActionError,
  addEvent,
  addNote,
  addTask,
  appendPersonNote,
  completeTask,
  deleteEvent,
  eventInstant,
  moveEvent,
  whenLabel,
  type ActionCtx,
  type ActionResult,
} from "./actions";

const DATE = { type: "string", description: "Day as YYYY-MM-DD in Abdi's timezone." } as const;
const TIME = { type: "string", description: "Time as HH:mm, 24 hour, in Abdi's timezone." } as const;

export const JARVIS_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_memory",
    description: "Search everything Abdi has saved: his Obsidian vault, past chats, Fathom call summaries, Notes and People notes. Use it for any question about the past, about a person, or about what was said or decided. Returns ranked snippets with their source.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "A few keywords, such as a name and a topic." } }, required: ["query"] },
  },
  {
    name: "find_events",
    description: "List calendar events, to answer questions or to get the id of an event to move or delete. With no dates it looks from today through the next 14 days. Events marked locked come from Calendly, Fathom or a feed and cannot be changed.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Words in the title or the person's name. Optional." }, from: DATE, to: DATE },
    },
  },
  {
    name: "find_person",
    description: "Look up people in Abdi's People list by name. Returns their notes.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "find_tasks",
    description: "List open tasks, optionally filtered by words in the title. Use it to get the id of a task to finish.",
    input_schema: { type: "object", properties: { query: { type: "string" } } },
  },
  {
    name: "add_event",
    description: "Add an event to Abdi's calendar. Leave out startTime for an all-day event. It is copied to Google Calendar when Google is connected.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title, such as 'Lunch with Omar'." },
        date: DATE,
        startTime: TIME,
        endTime: TIME,
        location: { type: "string" },
        notes: { type: "string" },
        person: { type: "string", description: "Name of the person it is with, if any." },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "move_event",
    description: "Move an event to a new day and/or time. Get the eventId from find_events first. Give only what changes. Locked events are refused.",
    input_schema: { type: "object", properties: { eventId: { type: "string" }, date: DATE, startTime: TIME, endTime: TIME }, required: ["eventId"] },
  },
  {
    name: "delete_event",
    description: "Delete an event. Get the eventId from find_events first. Locked events are refused.",
    input_schema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"] },
  },
  {
    name: "add_note",
    description: "Save a new note on the Notes page.",
    input_schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["body"] },
  },
  {
    name: "append_person_note",
    description: "Add a dated line to a person's notes in People. If nobody matches the name, nothing is changed.",
    input_schema: { type: "object", properties: { name: { type: "string" }, text: { type: "string" } }, required: ["name", "text"] },
  },
  {
    name: "add_task",
    description: "Add a task. With no due date it goes on Today.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, dueDate: DATE, dueTime: TIME, person: { type: "string", description: "Name of the person it involves, if any." } },
      required: ["title"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task done, by taskId from find_tasks or by its title.",
    input_schema: { type: "object", properties: { taskId: { type: "string" }, title: { type: "string" } } },
  },
];

const str = z.string().trim();
const date = str.regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD.");
const time = str.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must be HH:mm, 24 hour.");

const schemas = {
  search_memory: z.object({ query: str.min(1).max(200) }),
  find_events: z.object({ query: str.max(100).optional(), from: date.optional(), to: date.optional() }),
  find_person: z.object({ name: str.min(1).max(100) }),
  find_tasks: z.object({ query: str.max(100).optional() }),
  add_event: z.object({
    title: str.min(1).max(200),
    date,
    startTime: time.optional(),
    endTime: time.optional(),
    location: str.max(500).optional(),
    notes: str.max(2000).optional(),
    person: str.max(100).optional(),
  }),
  move_event: z.object({ eventId: str.min(1), date: date.optional(), startTime: time.optional(), endTime: time.optional() }),
  delete_event: z.object({ eventId: str.min(1) }),
  add_note: z.object({ title: str.max(200).optional(), body: str.min(1).max(20000) }),
  append_person_note: z.object({ name: str.min(1).max(100), text: str.min(1).max(2000) }),
  add_task: z.object({ title: str.min(1).max(300), dueDate: date.optional(), dueTime: time.optional(), person: str.max(100).optional() }),
  complete_task: z.object({ taskId: str.min(1).optional(), title: str.min(1).max(300).optional() }),
} as const;

export type ToolName = keyof typeof schemas;
export type Source = { title: string; url: string | null };
export type ToolOutcome = { content: unknown; isError?: boolean; action?: ActionResult; sources?: Source[] };

function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(schemas, name);
}

async function findEvents(input: z.infer<typeof schemas.find_events>, ctx: ActionCtx) {
  const now = ctx.now ?? new Date();
  const today = dayKey(now, ctx.tz);
  const fromKey = input.from ?? (input.query ? addDaysKey(today, -30) : today);
  const toKey = input.to ?? addDaysKey(input.from ?? today, input.query ? 60 : 14);
  const from = eventInstant(fromKey, "00:00", ctx.tz);
  const to = eventInstant(toKey, "23:59", ctx.tz);
  const q = input.query?.trim();
  const rows = await prisma.calendarEvent.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { person: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { person: { select: { name: true } } },
    orderBy: { date: "asc" },
    take: 25,
  });
  return {
    from: fromKey,
    to: toKey,
    events: rows.map((e) => ({
      id: e.id,
      title: e.title,
      when: whenLabel(e, ctx.tz),
      date: dayKey(e.date, ctx.tz),
      startTime: e.allDay ? null : e.startTime,
      endTime: e.allDay ? null : e.endTime,
      person: e.person?.name ?? null,
      locked: isLockedSource(e.source),
    })),
  };
}

async function findPeople(name: string) {
  const rows = await prisma.person.findMany({ where: { name: { contains: name, mode: "insensitive" } }, orderBy: { name: "asc" }, take: 5 });
  const first = name.split(/\s+/)[0];
  const more = rows.length === 0 && first !== name ? await prisma.person.findMany({ where: { name: { contains: first, mode: "insensitive" } }, take: 5 }) : [];
  return { people: [...rows, ...more].map((p) => ({ id: p.id, name: p.name, notes: p.notes ? p.notes.slice(-600) : null })) };
}

async function findTasks(query: string | undefined, tz: string) {
  const rows = await prisma.task.findMany({
    where: { status: { not: TaskStatus.COMPLETED }, ...(query ? { title: { contains: query, mode: "insensitive" } } : {}) },
    orderBy: [{ pinnedToday: "desc" }, { position: "asc" }],
    take: 20,
    select: { id: true, title: true, status: true, dueDate: true, pinnedToday: true },
  });
  return { tasks: rows.map((t) => ({ id: t.id, title: t.title, status: t.status, due: t.dueDate ? dayKey(t.dueDate, tz) : null, today: t.pinnedToday })) };
}

/** Runs one tool call. Never throws: problems come back as an error result the model can say. */
export async function runTool(name: string, rawInput: unknown, ctx: ActionCtx): Promise<ToolOutcome> {
  if (!isToolName(name)) return { content: { error: `There is no tool called ${name}.` }, isError: true };
  const parsed = schemas[name].safeParse(rawInput ?? {});
  if (!parsed.success) return { content: { error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, isError: true };

  try {
    let action: ActionResult;
    switch (name) {
      case "search_memory": {
        const { query } = parsed.data as z.infer<typeof schemas.search_memory>;
        const hits = await searchMemory(query, { limit: 6 });
        if (hits.length === 0) return { content: { results: [], note: "Nothing in memory matches that." } };
        return {
          content: { results: hits.map((h) => ({ source: h.source, title: h.title, date: h.date?.slice(0, 10) ?? null, snippet: h.snippet })) },
          sources: hits.map((h) => ({ title: h.title, url: h.url })),
        };
      }
      case "find_events":
        return { content: await findEvents(parsed.data as z.infer<typeof schemas.find_events>, ctx) };
      case "find_person":
        return { content: await findPeople((parsed.data as z.infer<typeof schemas.find_person>).name) };
      case "find_tasks":
        return { content: await findTasks((parsed.data as z.infer<typeof schemas.find_tasks>).query, ctx.tz) };
      case "add_event":
        action = await addEvent(parsed.data as z.infer<typeof schemas.add_event>, ctx);
        break;
      case "move_event":
        action = await moveEvent(parsed.data as z.infer<typeof schemas.move_event>, ctx);
        break;
      case "delete_event":
        action = await deleteEvent(parsed.data as z.infer<typeof schemas.delete_event>, ctx);
        break;
      case "add_note":
        action = await addNote(parsed.data as z.infer<typeof schemas.add_note>);
        break;
      case "append_person_note":
        action = await appendPersonNote(parsed.data as z.infer<typeof schemas.append_person_note>, ctx);
        break;
      case "add_task":
        action = await addTask(parsed.data as z.infer<typeof schemas.add_task>, ctx);
        break;
      case "complete_task": {
        const input = parsed.data as z.infer<typeof schemas.complete_task>;
        if (!input.taskId && !input.title) return { content: { error: "Give a taskId or a title." }, isError: true };
        action = await completeTask(input, ctx);
        break;
      }
    }
    return { content: { done: action.summary }, action };
  } catch (err) {
    if (err instanceof ActionError) return { content: { error: err.message }, isError: true };
    console.error(`[jarvis] tool ${name} failed`, err instanceof Error ? err.message : err);
    return { content: { error: "That didn't work because of a problem on my side." }, isError: true };
  }
}
