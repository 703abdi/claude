import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, parseMoneyCents, shortMoney, describeScore, landsInToday, commandHint } from "@/lib/command-parse";

test("empty, nav and find", () => {
  assert.deepEqual(parseCommand("   "), { kind: "empty" });
  assert.deepEqual(parseCommand("/tasks"), { kind: "nav", href: "/tasks", label: "Tasks" });
  assert.deepEqual(parseCommand("/nowhere"), { kind: "task", text: "/nowhere" });
  assert.deepEqual(parseCommand("find ali"), { kind: "find", query: "ali" });
  assert.deepEqual(parseCommand("?invoice"), { kind: "find", query: "invoice" });
});

test("scoreboard logs", () => {
  assert.deepEqual(parseCommand("5 dials"), { kind: "score", field: "dials", delta: 5 });
  assert.deepEqual(parseCommand("+3 convos"), { kind: "score", field: "convos", delta: 3 });
  assert.deepEqual(parseCommand("dial"), { kind: "score", field: "dials", delta: 1 });
  assert.deepEqual(parseCommand("booked"), { kind: "score", field: "booked", delta: 1 });
  assert.deepEqual(parseCommand("cash 500"), { kind: "score", field: "cashCents", delta: 50000 });
  assert.deepEqual(parseCommand("$2k"), { kind: "score", field: "cashCents", delta: 200000 });
});

test("bare 'call' and 'book' are tasks, not logs", () => {
  assert.deepEqual(parseCommand("call"), { kind: "task", text: "call" });
  assert.deepEqual(parseCommand("book"), { kind: "task", text: "book" });
  assert.deepEqual(parseCommand("Buy milk"), { kind: "task", text: "Buy milk" });
});

test("notes for self and for an agent", () => {
  assert.deepEqual(parseCommand("note buy milk"), { kind: "note", agent: "abdi", text: "buy milk" });
  assert.deepEqual(parseCommand("note for Jarvis: check the brief"), { kind: "note", agent: "jarvis", text: "check the brief" });
  assert.deepEqual(parseCommand("note for jarvis"), { kind: "note", agent: "jarvis", text: "" });
});

test("money helpers", () => {
  assert.equal(parseMoneyCents("1,250.50"), 125050);
  assert.equal(parseMoneyCents("$500"), 50000);
  assert.equal(parseMoneyCents("abc"), null);
  assert.equal(shortMoney(2_000_000), "$20k");
  assert.equal(shortMoney(120_000), "$1.2k");
  assert.equal(shortMoney(50_000), "$500");
  assert.equal(describeScore("booked", 1), "1 booked call");
  assert.equal(describeScore("dials", 5), "5 dials");
  assert.equal(describeScore("cashCents", 50000), "$500 cash");
});

test("landsInToday and hints", () => {
  assert.equal(landsInToday({ pinToday: false, dueDate: null, dueLabel: null }), true);
  assert.equal(landsInToday({ pinToday: false, dueDate: "x", dueLabel: "tomorrow" }), false);
  assert.equal(landsInToday({ pinToday: true, dueDate: "x", dueLabel: "tomorrow" }), true);
  assert.equal(commandHint({ kind: "score", field: "dials", delta: 2 }), "Will log 2 dials");
  assert.equal(commandHint({ kind: "nav", href: "/people", label: "People" }), "Will open People");
});
