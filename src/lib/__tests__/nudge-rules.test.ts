import { test } from "node:test";
import assert from "node:assert/strict";
import { dueNudges, isoWeek, type NudgeEventIn, type NudgeInput } from "../jarvis/nudge-rules";
import { zonedTime } from "../day";

const TZ = "America/New_York";

function at(h: number, m: number, d = 12) {
  return zonedTime(2026, 11, d, h, m, TZ);
}

function ev(id: string, title: string, day: number, start: string | null, extra: Partial<NudgeEventIn> = {}): NudgeEventIn {
  const [h, m] = (start ?? "00:00").split(":").map(Number);
  return { id, title, date: zonedTime(2026, 11, day, h, m, TZ), startTime: start, endTime: null, allDay: !start, ...extra };
}

function run(now: Date, partial: Partial<NudgeInput> = {}) {
  return dueNudges({ now, tz: TZ, morningTime: "06:00", name: "Abdi", events: [], waiting: [], ...partial });
}

const kinds = (list: ReturnType<typeof dueNudges>, kind: string) => list.filter((n) => n.kind === kind);

// Pre-call

test("precall fires at 15 minutes away, not at 16", () => {
  const events = [ev("e1", "Call with Omar", 12, "10:15", { person: { id: "p1", name: "Omar" } })];
  assert.equal(kinds(run(at(9, 59), { events }), "precall").length, 0);
  const due = kinds(run(at(10, 0), { events }), "precall");
  assert.equal(due.length, 1);
  assert.equal(due[0].key, "precall:e1:2026-11-12");
  assert.equal(due[0].title, "Call with Omar in 15 min");
  assert.match(due[0].body, /With Omar/);
  assert.deepEqual(due[0].person, { id: "p1", name: "Omar" });
});

test("precall fires at 0 minutes and stops once the start has passed", () => {
  const events = [ev("e1", "Standup", 12, "10:15")];
  assert.equal(kinds(run(at(10, 15), { events }), "precall")[0].title, "Standup now");
  assert.equal(kinds(run(at(10, 16), { events }), "precall").length, 0);
});

test("an all-day event never fires precall", () => {
  const events = [ev("e2", "Holiday", 12, null)];
  for (const [h, m] of [[0, 0], [0, 5], [9, 0], [23, 50]]) {
    assert.equal(kinds(run(at(h, m), { events }), "precall").length, 0);
  }
});

test("precall ignores tomorrow's event at the same clock time", () => {
  const events = [ev("e3", "Tomorrow call", 13, "10:10")];
  assert.equal(kinds(run(at(10, 0), { events }), "precall").length, 0);
});

// Morning

test("morning fires from the set time until three hours after", () => {
  const events = [ev("a", "Lunch", 12, "13:00"), ev("b", "Gym", 12, "18:00")];
  assert.equal(kinds(run(at(5, 59), { events }), "morning").length, 0);
  const m = kinds(run(at(6, 0), { events }), "morning");
  assert.equal(m.length, 1);
  assert.equal(m[0].key, "morning:2026-11-12");
  assert.equal(m[0].title, "Good morning, Abdi");
  assert.match(m[0].body, /2 things/);
  assert.equal(kinds(run(at(8, 59), { events }), "morning").length, 1);
  assert.equal(kinds(run(at(9, 0), { events }), "morning").length, 0);
});

test("morning follows the user's own time", () => {
  assert.equal(kinds(run(at(7, 29), { morningTime: "07:30" }), "morning").length, 0);
  assert.equal(kinds(run(at(7, 30), { morningTime: "07:30" }), "morning").length, 1);
});

// Waiting

test("waiting: 2 days does not fire, 3 days does", () => {
  const now = at(12, 0);
  const two = [{ personId: "p1", person: "Omar", title: "Send the deck", since: new Date(now.getTime() - 2 * 86_400_000) }];
  assert.equal(kinds(run(now, { waiting: two }), "waiting").length, 0);
  const three = [{ personId: "p1", person: "Omar", title: "Send the deck", since: new Date(now.getTime() - 3 * 86_400_000) }];
  const w = kinds(run(now, { waiting: three }), "waiting");
  assert.equal(w.length, 1);
  assert.equal(w[0].title, "Omar still owes you");
  assert.equal(w[0].body, "Send the deck");
  assert.equal(w[0].key, `waiting:p1:${isoWeek("2026-11-12")}`);
});

test("waiting groups items by person and keeps the same key all week", () => {
  const since = at(9, 0, 1);
  const waiting = [
    { personId: "p1", person: "Omar", title: "Deck", since },
    { personId: "p1", person: "Omar", title: "Invoice", since },
    { personId: null, person: "Sara", title: "Intro", since: null },
  ];
  const mon = kinds(run(at(12, 0, 9), { waiting }), "waiting");
  const sun = kinds(run(at(12, 0, 15), { waiting }), "waiting");
  assert.equal(mon.length, 1);
  assert.equal(mon[0].body, "Deck; Invoice");
  assert.equal(mon[0].key, sun[0].key);
  const nextMon = kinds(run(at(12, 0, 16), { waiting }), "waiting");
  assert.notEqual(nextMon[0].key, mon[0].key);
});

test("isoWeek matches known weeks", () => {
  assert.equal(isoWeek("2026-11-12"), "2026-W46");
  assert.equal(isoWeek("2027-01-01"), "2026-W53");
  assert.equal(isoWeek("2025-12-29"), "2026-W01");
});

// Call

test("call fires for a recording that ended in the last 6 hours", () => {
  const events = [ev("c1", "Omar intro", 12, "09:00", { endTime: "09:30", recordingUrl: "https://fathom.video/share/x" })];
  assert.equal(kinds(run(at(9, 15), { events }), "call").length, 0); // still going
  const c = kinds(run(at(9, 30), { events }), "call");
  assert.equal(c.length, 1);
  assert.equal(c[0].key, "call:c1");
  assert.equal(c[0].title, "Call recorded: Omar intro");
  assert.equal(c[0].url, "https://fathom.video/share/x");
  assert.equal(kinds(run(at(15, 30), { events }), "call").length, 1);
  assert.equal(kinds(run(at(15, 31), { events }), "call").length, 0);
});

test("call uses recentCalls too and does not double count", () => {
  const call = ev("c2", "Late call", 11, "22:00", { endTime: "23:00", recordingUrl: "https://fathom.video/share/y" });
  const c = kinds(run(at(1, 0), { events: [call], recentCalls: [call] }), "call");
  assert.equal(c.length, 1);
  const unrecorded = ev("c3", "No recording", 12, "09:00", { endTime: "09:30" });
  assert.equal(kinds(run(at(10, 0), { events: [unrecorded] }), "call").length, 0);
});

// Tomorrow

test("tomorrow: 19:59 no, 20:00 yes, 22:00 no", () => {
  const events = [ev("t2", "Gym", 13, "11:00"), ev("t1", "Call with Sara", 13, "09:30", { person: { id: "p2", name: "Sara" } })];
  assert.equal(kinds(run(at(19, 59), { events }), "tomorrow").length, 0);
  const t = kinds(run(at(20, 0), { events }), "tomorrow");
  assert.equal(t.length, 1);
  assert.equal(t[0].key, "tomorrow:2026-11-13");
  assert.equal(t[0].title, "Tomorrow starts with Call with Sara at 9:30am");
  assert.match(t[0].body, /With Sara\. 1 more after that\./);
  assert.equal(kinds(run(at(21, 59), { events }), "tomorrow").length, 1);
  assert.equal(kinds(run(at(22, 0), { events }), "tomorrow").length, 0);
});

test("tomorrow skips all-day events and fires nothing without a timed one", () => {
  const events = [ev("h", "Holiday", 13, null)];
  assert.equal(kinds(run(at(20, 30), { events }), "tomorrow").length, 0);
});
