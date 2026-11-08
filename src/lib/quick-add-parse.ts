import type { Category, Effort } from "@/lib/types";

/** Shared natural-language parser for the Tasks and Hub quick-add inputs.
 *
 *   #area        category (prefix match)
 *   @name        existing person (prefix match on full name or any word of it)
 *   !high !med !low   effort
 *   today, tomorrow, mon..sun, next week   due date
 *   3pm, 3:30pm, 15:00, at 3   due time
 *   >today or a trailing *     pin to Today
 */

export type PersonLite = { id: string; name: string };

export type ParsedQuickAdd = {
  title: string;
  category: Category | null;
  /** "#tag" typed but no category matched */
  unknownCategory: string | null;
  people: PersonLite[];
  /** "@name" tokens that matched nobody (left in the title) */
  unknownPeople: string[];
  effort: Effort | null;
  /** ISO string, local noon of the due day */
  dueDate: string | null;
  dueLabel: string | null;
  /** HH:mm */
  dueTime: string | null;
  pinToday: boolean;
};

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const EFFORT: Record<string, Effort> = {
  high: "HIGH",
  h: "HIGH",
  med: "MEDIUM",
  medium: "MEDIUM",
  m: "MEDIUM",
  low: "LOW",
  l: "LOW",
};

function noon(d: Date) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function nextWeekday(now: Date, target: number) {
  const diff = (target - now.getDay() + 7) % 7 || 7;
  return addDays(now, diff);
}

/** Tokens that carry meta (tag, person, effort, pin), not title words or dates. */
function isMeta(word: string) {
  return /^[#@!>]/.test(word) || word === "*";
}

function clean(word: string) {
  return word.toLowerCase().replace(/[.,;:!?]+$/, "");
}

function parseClock(word: string): string | null {
  const w = clean(word);
  let m = w.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)$/);
  if (m) {
    let h = Number(m[1]);
    const mi = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || mi > 59) return null;
    const pm = m[3].startsWith("p");
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  m = w.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return null;
}

/** "at 3" style bare hour: 1-7 means afternoon, 8-11 morning, 12 noon. */
function parseBareHour(word: string): string | null {
  const w = clean(word);
  const m = w.match(/^(\d{1,2})(?::([0-5]\d))?$/);
  if (!m) return null;
  let h = Number(m[1]);
  if (h < 1 || h > 23) return null;
  if (h <= 7) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}

function dayLabel(d: Date, now: Date) {
  const diff = Math.round((noon(d).getTime() - noon(now).getTime()) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return DAY_NAMES[d.getDay()].slice(0, 3);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase();
}

export function matchPeople(token: string, people: PersonLite[]): PersonLite | null {
  const q = token.toLowerCase();
  if (!q) return null;
  return (
    people.find((p) => p.name.toLowerCase().startsWith(q)) ??
    people.find((p) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))) ??
    null
  );
}

export function parseQuickAdd(
  raw: string,
  opts: { categories: Category[]; people?: PersonLite[]; now?: Date }
): ParsedQuickAdd {
  const now = opts.now ?? new Date();
  const people = opts.people ?? [];
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];

  let category: Category | null = null;
  let unknownCategory: string | null = null;
  const matched: PersonLite[] = [];
  const unknownPeople: string[] = [];
  let effort: Effort | null = null;
  let due: Date | null = null;
  let dueTime: string | null = null;
  let pinToday = false;

  const dropConnector = () => {
    const last = kept[kept.length - 1]?.toLowerCase();
    if (last === "on" || last === "by" || last === "due") kept.pop();
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const w = clean(word);
    const next = words[i + 1];
    const isLast = i === words.length - 1;
    const lastWordish = words.slice(i + 1).every(isMeta);

    // pin
    if (w === ">today" || w === "*") {
      pinToday = true;
      continue;
    }
    if (isLast && word.endsWith("*") && word.length > 1) {
      pinToday = true;
      words[i] = word.slice(0, -1);
      i--;
      continue;
    }

    // category
    const tag = word.match(/^#([\w-]+)$/);
    if (tag) {
      const name = tag[1].toLowerCase();
      const hit =
        opts.categories.find((c) => c.name.toLowerCase().startsWith(name)) ??
        opts.categories.find((c) => name.startsWith(c.name.toLowerCase())) ??
        opts.categories.find((c) => c.name.toLowerCase().split(/\s+/).some((p) => p.startsWith(name)));
      if (hit) category = hit;
      else unknownCategory = tag[1];
      continue;
    }

    // person
    const at = word.match(/^@([\w.'-]+)$/);
    if (at) {
      const hit = matchPeople(at[1].replace(/[.,]+$/, ""), people);
      if (hit) {
        if (!matched.some((p) => p.id === hit.id)) matched.push(hit);
        continue;
      }
      unknownPeople.push(at[1]);
      kept.push(word);
      continue;
    }

    // effort
    const bang = w.match(/^!(\w+)$/);
    if (bang && EFFORT[bang[1]]) {
      effort = EFFORT[bang[1]];
      continue;
    }

    // dates
    if (w === "today" || w === "tonight") {
      due = now;
      dropConnector();
      continue;
    }
    if (w === "tomorrow" || w === "tmrw" || w === "tmr") {
      due = addDays(now, 1);
      dropConnector();
      continue;
    }
    if (w === "next" && next && clean(next) === "week") {
      due = nextWeekday(now, 1);
      dropConnector();
      i++;
      continue;
    }
    const full = DAY_NAMES.indexOf(w);
    const abbr = DAY_ABBR.indexOf(w);
    const nextIsTime = next ? parseClock(next) !== null || clean(next) === "at" : false;
    if (full !== -1 || (abbr !== -1 && (lastWordish || nextIsTime || kept[kept.length - 1]?.toLowerCase() === "on"))) {
      due = nextWeekday(now, full !== -1 ? full : abbr);
      dropConnector();
      continue;
    }

    // times
    const clock = parseClock(word);
    if (clock) {
      dueTime = clock;
      if (kept[kept.length - 1]?.toLowerCase() === "at") kept.pop();
      continue;
    }
    if (w === "at" && next) {
      const t = parseClock(next) ?? parseBareHour(next);
      if (t) {
        dueTime = t;
        i++;
        continue;
      }
    }

    kept.push(word);
  }

  if (dueTime && !due) due = now;
  const dueDate = due ? noon(due).toISOString() : null;

  return {
    title: kept.join(" ").trim(),
    category,
    unknownCategory,
    people: matched,
    unknownPeople,
    effort,
    dueDate,
    dueLabel: due ? dayLabel(due, now) : null,
    dueTime,
    pinToday,
  };
}

/** "15:00" -> "3pm", "09:30" -> "9:30am" */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}
