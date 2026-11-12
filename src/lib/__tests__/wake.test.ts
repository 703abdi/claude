import { test } from "node:test";
import assert from "node:assert/strict";
import { wakeCommand } from "../../components/jarvis/voice";

test("the wake word is stripped and the rest is the command", () => {
  assert.equal(wakeCommand("Hey Jarvis, what's next?"), "what's next");
  assert.equal(wakeCommand("jarvis add lunch with Omar friday 1pm"), "add lunch with Omar friday 1pm");
  assert.equal(wakeCommand("okay Jarvis who am I waiting on"), "who am I waiting on");
});

test("only the name arms it; no name is ignored", () => {
  assert.equal(wakeCommand("Jarvis"), "");
  assert.equal(wakeCommand("hey jarvis."), "");
  assert.equal(wakeCommand("what's next"), null);
  assert.equal(wakeCommand(""), null);
});

test("the name in the middle of a sentence still counts, taking what follows", () => {
  assert.equal(wakeCommand("so anyway Jarvis move my 3pm to tomorrow"), "move my 3pm to tomorrow");
});
