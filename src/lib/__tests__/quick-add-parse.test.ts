import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd, formatClock, matchPeople } from "@/lib/quick-add-parse";
import type { Category } from "@/lib/types";

// Monday Nov 9 2026, 10:00 local (the test script pins TZ=America/New_York).
const now = new Date(2026, 10, 9, 10, 0);
const categories: Category[] = [
  { id: "c1", name: "Personal", color: "#fff" },
  { id: "c2", name: "Agency", color: "#fff" },
];
const people = [
  { id: "p1", name: "Ali Hassan" },
  { id: "p2", name: "John Baker" },
];

test("pulls tag, person, effort, date, time and pin out of the title", () => {
  const p = parseQuickAdd("Call mom tomorrow 3pm #pers @hassan !high >today", { categories, people, now });
  assert.equal(p.title, "Call mom");
  assert.equal(p.category?.id, "c1");
  assert.deepEqual(p.people.map((x) => x.id), ["p1"]);
  assert.equal(p.effort, "HIGH");
  assert.equal(p.dueLabel, "tomorrow");
  assert.equal(p.dueTime, "15:00");
  assert.equal(p.pinToday, true);
  assert.equal(new Date(p.dueDate!).getDate(), 10);
});

test("unknown tags and people are reported, unknown people stay in the title", () => {
  const p = parseQuickAdd("Ping @bob about #nope", { categories, people, now });
  assert.equal(p.title, "Ping @bob about");
  assert.equal(p.unknownCategory, "nope");
  assert.deepEqual(p.unknownPeople, ["bob"]);
  assert.equal(p.category, null);
  assert.equal(p.dueDate, null);
});

test("weekday after 'on' sets the next such day and drops the connector", () => {
  const p = parseQuickAdd("Send invoice on fri", { categories, now });
  assert.equal(p.title, "Send invoice");
  assert.equal(p.dueLabel, "fri");
  assert.equal(new Date(p.dueDate!).getDate(), 13);
});

test("'at 3' reads as 3pm today", () => {
  const p = parseQuickAdd("Gym at 3", { categories, now });
  assert.equal(p.title, "Gym");
  assert.equal(p.dueTime, "15:00");
  assert.equal(p.dueLabel, "today");
});

test("a trailing * pins to Today", () => {
  const p = parseQuickAdd("Pay rent*", { categories, now });
  assert.equal(p.title, "Pay rent");
  assert.equal(p.pinToday, true);
});

test("next week means next Monday", () => {
  const p = parseQuickAdd("Plan Q1 next week", { categories, now });
  assert.equal(p.title, "Plan Q1");
  assert.equal(new Date(p.dueDate!).getDate(), 16);
});

test("formatClock and matchPeople", () => {
  assert.equal(formatClock("15:00"), "3pm");
  assert.equal(formatClock("09:30"), "9:30am");
  assert.equal(formatClock("00:00"), "12am");
  assert.equal(matchPeople("jo", people)?.id, "p2");
  assert.equal(matchPeople("zz", people), null);
});
