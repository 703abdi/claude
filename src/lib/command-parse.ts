import type { ScoreField } from "@/lib/hub-types";
import { formatClock, type ParsedQuickAdd } from "@/lib/quick-add-parse";

/** What the Hub command bar will do with a line of text. Pure, no React, no fetch.
 *
 *   plain text                    quick add (shared quick-add parser), lands in Today
 *   5 dials, dial, +3 convos      scoreboard increment
 *   booked, cash 500, $500, $2k   scoreboard increment (cash in cents)
 *   note ..., note for jarvis: .. agent inbox note
 *   /tasks /calendar /people ...  navigate
 *   find <text>, ?<text>          open the command palette with the query
 */
export type Command =
  | { kind: "empty" }
  | { kind: "task"; text: string }
  | { kind: "score"; field: ScoreField; delta: number }
  | { kind: "note"; agent: string; text: string }
  | { kind: "nav"; href: string; label: string }
  | { kind: "find"; query: string };

export const NAV_TARGETS: Record<string, string> = {
  hub: "Hub",
  tasks: "Tasks",
  calendar: "Calendar",
  people: "People",
  town: "Town",
  metrics: "Metrics",
  brief: "Brief",
  settings: "Settings",
};

/** The agent a plain "note ..." is filed under. */
export const SELF_AGENT = "abdi";

const COUNT_FIELDS: Record<string, Exclude<ScoreField, "cashCents">> = {
  dial: "dials",
  dials: "dials",
  call: "dials",
  calls: "dials",
  convo: "convos",
  convos: "convos",
  conversation: "convos",
  conversations: "convos",
  booked: "booked",
  booking: "booked",
  bookings: "booked",
  book: "booked",
};

/** "500" -> 50000, "1,250.50" -> 125050, "2k" -> 200000. Null when it isn't a number. */
export function parseMoneyCents(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(k)?$/);
  if (!m) return null;
  const whole = Number(m[1].replace(/,/g, ""));
  const frac = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  const cents = whole * 100 + frac;
  return m[3] ? cents * 1000 : cents;
}

function parseScore(text: string): Command | null {
  const t = text.trim().toLowerCase();

  // cash 500 / cash $500 / +$500 / $500 / 500 cash
  let m = t.match(/^cash\s+\+?(\S+)$/) ?? t.match(/^\+?(\$\S+)$/) ?? t.match(/^\+?(\S+)\s+cash$/);
  if (m) {
    const cents = parseMoneyCents(m[1]);
    if (cents !== null && cents > 0) return { kind: "score", field: "cashCents", delta: cents };
  }

  // 5 dials / +3 convos / dial / booked / 2 booked
  m = t.match(/^\+?(\d{1,4})?\s*([a-z]+)$/);
  if (m && COUNT_FIELDS[m[2]]) {
    const n = m[1] ? Number(m[1]) : 1;
    // A bare word like "call" or "book" alone reads more like a task title than a log.
    if (!m[1] && (m[2] === "call" || m[2] === "calls" || m[2] === "book")) return null;
    if (n > 0) return { kind: "score", field: COUNT_FIELDS[m[2]], delta: n };
  }
  return null;
}

export function parseCommand(raw: string): Command {
  const text = raw.trim();
  if (!text) return { kind: "empty" };

  const nav = text.match(/^\/([a-z]+)\s*$/i);
  if (nav) {
    const key = nav[1].toLowerCase();
    if (NAV_TARGETS[key]) return { kind: "nav", href: `/${key}`, label: NAV_TARGETS[key] };
  }

  const q = text.match(/^\?\s*([\s\S]*)$/) ?? text.match(/^find(?:\s+([\s\S]*))?$/i);
  if (q) return { kind: "find", query: (q[1] ?? "").trim() };

  // "note for jarvis: text" (the colon marks where the agent name ends), "note for jarvis"
  // while still typing, or a plain "note text" / "note: text" filed under Abdi.
  const forAgent = text.match(/^note\s+(?:for|to)\s+([a-z0-9_-]+)\s*(?::\s*([\s\S]*))?$/i);
  if (forAgent && (forAgent[2] !== undefined || !/\s/.test(text.slice(text.toLowerCase().indexOf(forAgent[1].toLowerCase()))))) {
    return { kind: "note", agent: forAgent[1].toLowerCase(), text: (forAgent[2] ?? "").trim() };
  }
  const note = text.match(/^note\b\s*:?\s*([\s\S]*)$/i);
  if (note) return { kind: "note", agent: SELF_AGENT, text: note[1].trim() };

  return parseScore(text) ?? { kind: "task", text };
}

const SCORE_NOUN: Record<Exclude<ScoreField, "cashCents">, [string, string]> = {
  dials: ["dial", "dials"],
  convos: ["convo", "convos"],
  booked: ["booked call", "booked calls"],
};

export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return `$${(Number.isInteger(dollars) ? dollars : Number(dollars.toFixed(2))).toLocaleString("en-US")}`;
}

/** "$20k", "$1.2k", "$500" */
export function shortMoney(cents: number): string {
  const d = Math.round(cents / 100);
  if (d >= 1000) {
    const k = d / 1000;
    return `$${Number.isInteger(k) ? k : Number(k.toFixed(1))}k`;
  }
  return `$${d}`;
}

/** "5 dials", "1 booked call", "$500 cash" */
export function describeScore(field: ScoreField, value: number): string {
  if (field === "cashCents") return `${formatMoney(value)} cash`;
  const [one, many] = SCORE_NOUN[field];
  return `${value} ${value === 1 ? one : many}`;
}

/** Whether a parsed quick add will show in Today (no date, pinned, or due today). */
export function landsInToday(p: Pick<ParsedQuickAdd, "pinToday" | "dueDate" | "dueLabel">): boolean {
  return p.pinToday || !p.dueDate || p.dueLabel === "today";
}

/** One line under the command bar: what Enter will do. */
export function commandHint(cmd: Command, task?: ParsedQuickAdd | null): string {
  switch (cmd.kind) {
    case "empty":
      return "Type a task, a log like 2 convos, a note, or /calendar";
    case "nav":
      return `Will open ${cmd.label}`;
    case "find":
      return cmd.query ? `Will search for "${cmd.query}"` : "Will open search";
    case "score":
      return `Will log ${describeScore(cmd.field, cmd.delta)}`;
    case "note":
      if (!cmd.text) return cmd.agent === SELF_AGENT ? "Type the note" : `Type the note for ${cmd.agent}`;
      return cmd.agent === SELF_AGENT ? "Will post a note to the agent feed" : `Will post a note for ${cmd.agent} in the agent feed`;
    case "task": {
      if (!task?.title) return "Type a task title";
      const parts = [landsInToday(task) ? "Will add to Today" : `Will save for ${task.dueLabel}`];
      if (task.category) parts.push(`#${task.category.name}`);
      for (const p of task.people) parts.push(`@${p.name.split(/\s+/)[0]}`);
      if (task.dueTime) parts.push(formatClock(task.dueTime));
      if (task.effort) parts.push(`${task.effort.toLowerCase()} effort`);
      return parts.join(" · ");
    }
  }
}
