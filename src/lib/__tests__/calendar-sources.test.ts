import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCallToEvent } from "../fathom";
import { googleEventBody } from "../google";
import { isLockedSource } from "../calendar-utils";
import { zonedTime } from "../day";

const TZ = "America/New_York";
const ev = (id: string, startTime: string | null, recordingUrl: string | null = null) => ({ id, startTime, recordingUrl });

test("a call attaches to the closest event within 90 minutes", () => {
  const day = [ev("a", "09:00"), ev("b", "14:00"), ev("c", "14:45")];
  assert.equal(matchCallToEvent("14:05", day)?.id, "b");
  assert.equal(matchCallToEvent("14:40", day)?.id, "c");
});

test("a call with nothing near it matches no event", () => {
  assert.equal(matchCallToEvent("18:00", [ev("a", "09:00"), ev("b", "14:00")]), null);
  assert.equal(matchCallToEvent("10:00", [ev("allday", null)]), null);
});

test("an event that already has a recording is not reused", () => {
  assert.equal(matchCallToEvent("14:05", [ev("b", "14:00", "https://fathom.video/share/x")]), null);
});

test("a timed event goes to Google with the day, the clock and the timezone", () => {
  const body = googleEventBody({ title: "Lunch", date: zonedTime(2026, 11, 13, 13, 0, TZ), startTime: "13:00", endTime: "14:00", allDay: false, location: "Cafe", notes: null }, TZ);
  assert.deepEqual(body.start, { dateTime: "2026-11-13T13:00:00", timeZone: TZ });
  assert.deepEqual(body.end, { dateTime: "2026-11-13T14:00:00", timeZone: TZ });
  assert.equal(body.summary, "Lunch");
  assert.equal(body.location, "Cafe");
});

test("no end time means 30 minutes; an end before the start is ignored", () => {
  const base = { title: "Call", date: zonedTime(2026, 11, 13, 9, 0, TZ), startTime: "09:00", allDay: false, location: null, notes: null };
  assert.deepEqual(googleEventBody({ ...base, endTime: null }, TZ).end, { dateTime: "2026-11-13T09:30:00", timeZone: TZ });
  assert.deepEqual(googleEventBody({ ...base, endTime: "08:00" }, TZ).end, { dateTime: "2026-11-13T09:30:00", timeZone: TZ });
});

test("an all-day event goes to Google as a date with the next day as the end", () => {
  const body = googleEventBody({ title: "Trip", date: zonedTime(2026, 11, 30, 12, 0, TZ), startTime: null, endTime: null, allDay: true, location: null, notes: null }, TZ);
  assert.deepEqual(body.start, { date: "2026-11-30" });
  assert.deepEqual(body.end, { date: "2026-12-01" });
});

test("Calendly, Fathom and feed events are locked; Google and local ones are not", () => {
  assert.deepEqual(["calendly", "fathom", "feed", "google", null].map(isLockedSource), [true, true, true, false, false]);
});
