import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBriefing, type BriefEventIn } from "../jarvis/briefing";
import { zonedTime } from "../day";

const TZ = "America/New_York";
// Wed Nov 12 2026, 10:00am New York.
const NOW = zonedTime(2026, 11, 12, 10, 0, TZ);

function ev(id: string, title: string, d: [number, number, number], start: string | null, extra: Partial<BriefEventIn> = {}): BriefEventIn {
  const [h, m] = (start ?? "12:00").split(":").map(Number);
  return { id, title, date: zonedTime(d[0], d[1], d[2], h, m, TZ), startTime: start, endTime: null, allDay: !start, ...extra };
}

function brief(events: BriefEventIn[], waiting: Parameters<typeof buildBriefing>[0]["waiting"] = []) {
  return buildBriefing({ now: NOW, tz: TZ, name: "Abdi", events, waiting });
}

test("an event from two days ago never shows", () => {
  const b = brief([ev("old", "10am call", [2026, 11, 10], "10:00")]);
  assert.equal(b.today.length + b.ahead.length, 0);
  assert.equal(b.next, null);
  assert.ok(!b.spoken.includes("10am call"));
  assert.equal(b.headline, "Your calendar is clear for the next week.");
});

test("an event earlier today that already ended is dropped", () => {
  const b = brief([ev("a", "Standup", [2026, 11, 12], "08:00", { endTime: "08:30" }), ev("b", "Lunch", [2026, 11, 12], "13:00")]);
  assert.deepEqual(b.today.map((l) => l.id), ["b"]);
  assert.equal(b.next?.id, "b");
  assert.equal(b.headline, "Lunch in 3h, at 1pm.");
});

test("an event in progress stays", () => {
  const b = brief([ev("a", "Deep work", [2026, 11, 12], "09:30", { endTime: "11:00" })]);
  assert.equal(b.today.length, 1);
  assert.equal(b.headline, "Deep work is on now.");
});

test("ahead is capped at 7 days and labelled", () => {
  const b = brief([ev("t", "Dentist", [2026, 11, 13], "09:00"), ev("w", "Trip", [2026, 11, 19], null), ev("far", "Far", [2026, 11, 20], "09:00")]);
  assert.deepEqual(b.ahead.map((l) => l.id), ["t", "w"]);
  assert.equal(b.ahead[0].dayLabel, "Tomorrow");
  assert.equal(b.ahead[1].dayLabel, "Thu Nov 19");
  assert.equal(b.headline, "Nothing left today. Next is Dentist, tomorrow at 9am.");
});

test("recorded calls show for 48 hours, then leave", () => {
  const b = brief([
    ev("c1", "Sales call", [2026, 11, 11], "15:00", { recordingUrl: "https://fathom.video/share/x" }),
    ev("c2", "Old call", [2026, 11, 9], "15:00", { recordingUrl: "https://fathom.video/share/y" }),
    ev("c3", "Later today", [2026, 11, 12], "16:00", { recordingUrl: "https://fathom.video/share/z" }),
  ]);
  assert.deepEqual(b.calls.map((c) => c.id), ["c1"]);
  assert.equal(b.calls[0].when, "Wed Nov 11 3pm");
});

test("waiting is grouped by person, oldest first", () => {
  const b = brief([], [
    { personId: "p1", person: "John", title: "Send contract", since: new Date(NOW.getTime() - 2 * 86_400_000) },
    { personId: "p2", person: "Ali", title: "Intro", since: new Date(NOW.getTime() - 5 * 86_400_000) },
    { personId: "p1", person: "John", title: "Invoice", since: new Date(NOW.getTime() - 1 * 86_400_000) },
  ]);
  assert.deepEqual(b.waiting.map((w) => [w.person, w.items.length, w.days]), [["Ali", 1, 5], ["John", 2, 2]]);
  assert.ok(b.spoken.includes("Waiting on Ali, John."));
});

test("greeting follows the clock in the user's timezone", () => {
  assert.equal(brief([]).greeting, "Good morning, Abdi");
  const evening = buildBriefing({ now: zonedTime(2026, 11, 12, 19, 0, TZ), tz: TZ, name: "Abdi", events: [], waiting: [] });
  assert.equal(evening.greeting, "Good evening, Abdi");
});
