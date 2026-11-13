import { addDaysKey, clockInTz, dayKey, partsInTz, utcDateFromKey } from "@/lib/day";

/** The Home briefing. Pure: give it rows and a clock, get back what to show and say.
 * Rules (Abdi, Nov 12 2026): nothing that already ended, no tasks, no money. Only what is
 * coming up, calls from the last 48 hours, and people who owe him something. */

export const CALL_WINDOW_HOURS = 48;
export const AHEAD_DAYS = 7;

export type BriefEventIn = {
  id: string;
  title: string;
  date: Date | string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location?: string | null;
  source?: string | null;
  recordingUrl?: string | null;
  person?: { id: string; name: string } | null;
};

export type BriefWaitingIn = { personId: string | null; person: string; title: string; since: Date | string | null };

export type EventLine = {
  id: string;
  title: string;
  dayKey: string;
  dayLabel: string; // "Today", "Tomorrow", "Fri Nov 14"
  time: string | null; // "2:30pm", null for all-day
  startTime: string | null;
  person: string | null;
  location: string | null;
  source: string | null;
  minutesAway: number | null; // today only, timed only
};

export type CallLine = { id: string; title: string; when: string; at: string; person: string | null; url: string };
export type WaitingLine = { personId: string | null; person: string; items: string[]; days: number };

export type Briefing = {
  generatedAt: string;
  greeting: string;
  headline: string;
  next: EventLine | null;
  today: EventLine[];
  ahead: EventLine[];
  calls: CallLine[];
  waiting: WaitingLine[];
  spoken: string;
};

export function fmtClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

function greetingFor(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayLabel(key: string, todayKey: string) {
  if (key === todayKey) return "Today";
  if (key === addDaysKey(todayKey, 1)) return "Tomorrow";
  const d = utcDateFromKey(key);
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function inWords(mins: number) {
  if (mins <= 1) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

export function buildBriefing(input: {
  now: Date;
  tz: string;
  name: string;
  events: BriefEventIn[];
  waiting: BriefWaitingIn[];
}): Briefing {
  const { now, tz, name } = input;
  const todayKey = dayKey(now, tz);
  const lastKey = addDaysKey(todayKey, AHEAD_DAYS);
  const clock = clockInTz(now, tz);
  const nowMin = minutesOf(clock);

  const lines: EventLine[] = [];
  const calls: CallLine[] = [];
  const callCutoff = now.getTime() - CALL_WINDOW_HOURS * 3_600_000;

  for (const e of input.events) {
    const date = new Date(e.date);
    const key = dayKey(date, tz);

    // A recorded call is "recent" for 48 hours after it started, then it leaves Home for good.
    if (e.recordingUrl) {
      const startedAt = date.getTime();
      const over = key < todayKey || (key === todayKey && (e.endTime ?? e.startTime ?? "00:00") < clock);
      if (over && startedAt >= callCutoff) {
        calls.push({
          id: e.id,
          title: e.title,
          when: `${dayLabel(key, todayKey)}${e.startTime ? ` ${fmtClock(e.startTime)}` : ""}`,
          at: date.toISOString(),
          person: e.person?.name ?? null,
          url: e.recordingUrl,
        });
      }
    }

    if (key < todayKey || key > lastKey) continue;
    if (key === todayKey && !e.allDay) {
      const end = e.endTime ?? e.startTime;
      if (end && end < clock) continue; // already over
    }
    lines.push({
      id: e.id,
      title: e.title,
      dayKey: key,
      dayLabel: dayLabel(key, todayKey),
      time: e.allDay || !e.startTime ? null : fmtClock(e.startTime),
      startTime: e.allDay ? null : e.startTime,
      person: e.person?.name ?? null,
      location: e.location ?? null,
      source: e.source ?? null,
      minutesAway: key === todayKey && !e.allDay && e.startTime ? Math.max(0, minutesOf(e.startTime) - nowMin) : null,
    });
  }

  lines.sort((a, b) => a.dayKey.localeCompare(b.dayKey) || (a.startTime ?? "00:00").localeCompare(b.startTime ?? "00:00"));
  calls.sort((a, b) => b.at.localeCompare(a.at));

  const today = lines.filter((l) => l.dayKey === todayKey);
  const ahead = lines.filter((l) => l.dayKey !== todayKey);
  const next = today.find((l) => l.startTime) ?? ahead.find((l) => l.startTime) ?? lines[0] ?? null;

  // Waiting: one line per person, oldest first.
  const byPerson = new Map<string, WaitingLine>();
  for (const w of input.waiting) {
    const days = w.since ? Math.max(0, Math.floor((now.getTime() - new Date(w.since).getTime()) / 86_400_000)) : 0;
    const k = w.personId ?? w.person;
    const row = byPerson.get(k) ?? { personId: w.personId, person: w.person, items: [], days: 0 };
    row.items.push(w.title);
    row.days = Math.max(row.days, days);
    byPerson.set(k, row);
  }
  const waiting = [...byPerson.values()].sort((a, b) => b.days - a.days);

  const hour = partsInTz(now, tz).h;
  const greeting = `${greetingFor(hour)}, ${name}`;

  let headline: string;
  if (next && next.dayKey === todayKey && next.minutesAway !== null) {
    headline = next.minutesAway <= 1 ? `${next.title} is ${(next.startTime ?? clock) < clock ? "on" : "starting"} now.` : `${next.title} ${inWords(next.minutesAway)}, at ${next.time}.`;
  } else if (today.length > 0) {
    headline = `${today.length} thing${today.length === 1 ? "" : "s"} on today.`;
  } else if (next) {
    headline = `Nothing left today. Next is ${next.title}, ${next.dayLabel.toLowerCase()}${next.time ? ` at ${next.time}` : ""}.`;
  } else {
    headline = "Your calendar is clear for the next week.";
  }

  const say: string[] = [`${greeting}.`, headline];
  const laterToday = today.filter((l) => l !== next);
  if (laterToday.length) {
    say.push(`Also today: ${laterToday.map((l) => `${l.title}${l.time ? ` at ${l.time}` : ""}`).join(", ")}.`);
  }
  if (ahead.length) {
    const first = ahead.filter((l) => l !== next).slice(0, 3);
    if (first.length) say.push(`Coming up: ${first.map((l) => `${l.title} ${l.dayLabel.toLowerCase()}${l.time ? ` at ${l.time}` : ""}`).join(", ")}.`);
  }
  if (calls.length) say.push(`${calls.length} recorded call${calls.length === 1 ? "" : "s"} in the last two days.`);
  if (waiting.length) {
    say.push(`Waiting on ${waiting.slice(0, 3).map((w) => w.person).join(", ")}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ""}.`);
  }

  return { generatedAt: now.toISOString(), greeting, headline, next, today, ahead, calls, waiting, spoken: say.join(" ") };
}
