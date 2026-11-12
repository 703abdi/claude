import { addDaysKey, clockInTz, dayKey, utcDateFromKey, zonedTime } from "@/lib/day";
import { buildBriefing, fmtClock, type BriefEventIn, type BriefWaitingIn } from "./briefing";

/** Which nudges are due right now. Pure: rows and a clock in, a list out. The caller
 * stores each one by its key, so a nudge that is due on several ticks in a row is
 * still sent once. Keys are built so each kind repeats only as often as it should. */

export const PRECALL_MINUTES = 15;
export const MORNING_WINDOW_MINUTES = 180;
export const WAITING_DAYS = 3;
export const CALL_WINDOW_HOURS = 6;
export const EVENING_FROM = "20:00";
export const EVENING_UNTIL = "22:00";

export type NudgeKind = "precall" | "morning" | "waiting" | "call" | "tomorrow";

export type Nudge = {
  kind: NudgeKind;
  key: string;
  title: string;
  body: string;
  url: string | null;
  /** Not stored. Lets the caller add what it knows about the person to a pre-call nudge. */
  person?: { id: string | null; name: string } | null;
};

export type NudgeEventIn = BriefEventIn;
export type NudgeWaitingIn = BriefWaitingIn;

export type NudgeInput = {
  now: Date;
  tz: string;
  /** "HH:mm" local time of the morning briefing. */
  morningTime: string;
  name?: string;
  events: NudgeEventIn[];
  waiting: NudgeWaitingIn[];
  /** Extra recorded calls not already in events. Optional; events with a recordingUrl count too. */
  recentCalls?: NudgeEventIn[];
};

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function validClock(hhmm: string | null | undefined): hhmm is string {
  return !!hhmm && /^\d{1,2}:\d{2}$/.test(hhmm);
}

/** ISO week of a day key, like "2026-W46". */
export function isoWeek(key: string) {
  const d = utcDateFromKey(key);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow + 3); // Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  // Days between this Thursday and the Thursday of the week holding Jan 4, over 7.
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 + jan4Dow - 3) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** When a timed event ends, as an instant. Falls back to the start time, then the stored date. */
function endInstant(e: NudgeEventIn, tz: string) {
  const date = new Date(e.date);
  const at = validClock(e.endTime) ? e.endTime : validClock(e.startTime) ? e.startTime : null;
  if (e.allDay || !at) return date;
  const [y, m, d] = dayKey(date, tz).split("-").map(Number);
  const [h, mi] = at.split(":").map(Number);
  return zonedTime(y, m, d, h, mi, tz);
}

function withPerson(person: string | null | undefined) {
  return person ? `With ${person}.` : "";
}

export function dueNudges(input: NudgeInput): Nudge[] {
  const { now, tz } = input;
  const todayKey = dayKey(now, tz);
  const tomorrowKey = addDaysKey(todayKey, 1);
  const clock = clockInTz(now, tz);
  const nowMin = minutesOf(clock);
  const out: Nudge[] = [];

  // Pre-call: a timed event today that starts in 0 to 15 minutes.
  for (const e of input.events) {
    if (e.allDay || !validClock(e.startTime)) continue;
    const key = dayKey(new Date(e.date), tz);
    if (key !== todayKey) continue;
    const away = minutesOf(e.startTime) - nowMin;
    if (away < 0 || away > PRECALL_MINUTES) continue;
    out.push({
      kind: "precall",
      key: `precall:${e.id}:${key}`,
      title: away === 0 ? `${e.title} now` : `${e.title} in ${away} min`,
      body: [withPerson(e.person?.name), `Starts at ${fmtClock(e.startTime)}.`].filter(Boolean).join(" "),
      url: null,
      person: e.person ? { id: e.person.id, name: e.person.name } : null,
    });
  }

  // Morning: from the set time until three hours after it.
  if (validClock(input.morningTime)) {
    const start = minutesOf(input.morningTime);
    const end = Math.min(start + MORNING_WINDOW_MINUTES, 24 * 60);
    if (nowMin >= start && nowMin < end) {
      const b = buildBriefing({ now, tz, name: input.name ?? "there", events: input.events, waiting: input.waiting });
      const n = b.today.length;
      const count = n === 0 ? "Nothing on today." : `${n} thing${n === 1 ? "" : "s"} today.`;
      out.push({
        kind: "morning",
        key: `morning:${todayKey}`,
        title: b.greeting,
        body: b.headline.includes(" on today.") ? b.headline : `${b.headline} ${count}`,
        url: null,
      });
    }
  }

  // Waiting: someone has owed something for 3 or more days. Once a week per person.
  const byPerson = new Map<string, { id: string | null; name: string; items: string[] }>();
  for (const w of input.waiting) {
    if (!w.since) continue;
    const days = Math.floor((now.getTime() - new Date(w.since).getTime()) / 86_400_000);
    if (days < WAITING_DAYS) continue;
    const k = w.personId ?? w.person;
    const row = byPerson.get(k) ?? { id: w.personId, name: w.person, items: [] };
    row.items.push(w.title);
    byPerson.set(k, row);
  }
  const week = isoWeek(todayKey);
  for (const [k, p] of byPerson) {
    out.push({
      kind: "waiting",
      key: `waiting:${k}:${week}`,
      title: `${p.name} still owes you`,
      body: p.items.join("; "),
      url: null,
    });
  }

  // Call: a recorded call that ended in the last 6 hours.
  const seen = new Set<string>();
  const cutoff = now.getTime() - CALL_WINDOW_HOURS * 3_600_000;
  for (const e of [...input.events, ...(input.recentCalls ?? [])]) {
    if (!e.recordingUrl || seen.has(e.id)) continue;
    seen.add(e.id);
    const ended = endInstant(e, tz).getTime();
    if (ended > now.getTime() || ended < cutoff) continue;
    out.push({
      kind: "call",
      key: `call:${e.id}`,
      title: `Call recorded: ${e.title}`,
      body: [withPerson(e.person?.name), "The recording and notes are ready."].filter(Boolean).join(" "),
      url: e.recordingUrl,
    });
  }

  // Tomorrow: between 8pm and 10pm, the first timed event tomorrow.
  if (clock >= EVENING_FROM && clock < EVENING_UNTIL) {
    const tomorrow = input.events
      .filter((e) => !e.allDay && validClock(e.startTime) && dayKey(new Date(e.date), tz) === tomorrowKey)
      .sort((a, b) => minutesOf(a.startTime!) - minutesOf(b.startTime!));
    const first = tomorrow[0];
    if (first) {
      const more = tomorrow.length - 1;
      out.push({
        kind: "tomorrow",
        key: `tomorrow:${tomorrowKey}`,
        title: `Tomorrow starts with ${first.title} at ${fmtClock(first.startTime!)}`,
        body: [withPerson(first.person?.name), more > 0 ? `${more} more after that.` : "Nothing else timed."].filter(Boolean).join(" "),
        url: null,
      });
    }
  }

  return out;
}
