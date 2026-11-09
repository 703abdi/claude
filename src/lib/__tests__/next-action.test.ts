import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAction, staleDays } from "@/lib/next-action";
import type { HubPayload } from "@/lib/hub-types";
import type { Task } from "@/lib/types";

// Monday Nov 9 2026, 10:00 local (the test script pins TZ=America/New_York).
const now = new Date(2026, 10, 9, 10, 0);

function task(over: Partial<Task> & { id: string; title: string }): Task {
  return { overdue: false, dueDate: null, pinnedToday: false, people: [], ...over } as unknown as Task;
}

function payload(over: Partial<Record<keyof HubPayload, unknown>> = {}): HubPayload {
  return {
    tz: "America/New_York",
    todayKey: "2026-11-09",
    policy: { eventLeadMin: 30, nudgeAfterDays: 3, rankingDay: null, ranking: [] },
    today: [],
    upNext: [],
    inbox: [],
    waitingOn: [],
    week: { outcomes: [] },
    ...over,
  } as unknown as HubPayload;
}

test("staleDays reads a passed date in the title", () => {
  assert.equal(staleDays({ title: "Promo through Oct 30 2026", dueDate: null }, now), 9);
  assert.equal(staleDays({ title: "Webinar on Nov 20", dueDate: null }, now), null);
  assert.equal(staleDays({ title: "No date here", dueDate: null }, now), null);
});

test("a late task beats everything", () => {
  const late = task({ id: "t1", title: "File taxes", overdue: true, dueDate: new Date(2026, 10, 7, 12).toISOString() });
  const d = payload({ today: [task({ id: "t2", title: "Other", pinnedToday: true }), late], inbox: [{ id: "i1", kind: "question", title: "Q", agent: "jarvis" }] });
  const a = nextAction(d, now);
  assert.equal(a.kind, "late");
  assert.equal(a.title, "File taxes");
  assert.match(a.detail, /^2 days late/);
});

test("an event inside the lead window comes next", () => {
  const d = payload({ upNext: [{ id: "e1", title: "Call with JB", date: new Date(2026, 10, 9, 12).toISOString(), startTime: "10:20", person: { name: "JB" } }] });
  const a = nextAction(d, now);
  assert.equal(a.kind, "event");
  assert.equal(a.detail, "In 20 min with JB. Get ready.");
});

test("an event outside the window is skipped for an agent question", () => {
  const d = payload({
    upNext: [{ id: "e1", title: "Later", date: new Date(2026, 10, 9, 12).toISOString(), startTime: "14:00", person: null }],
    inbox: [{ id: "i1", kind: "question", title: "Which offer?", agent: "jarvis" }],
  });
  const a = nextAction(d, now);
  assert.equal(a.kind, "question");
  assert.equal(a.detail, "jarvis is waiting on your answer.");
});

test("someone you have waited on too long gets a nudge", () => {
  const d = payload({
    waitingOn: [{ person: { id: "p1", name: "Ali" }, tasks: [{ title: "Send contract", followUpDate: null, waitingAt: new Date(2026, 10, 1).toISOString() }] }],
  });
  const a = nextAction(d, now);
  assert.equal(a.kind, "nudge");
  assert.equal(a.title, "Nudge Ali");
});

test("the brain's ranking for today wins over pinned", () => {
  const d = payload({
    policy: { eventLeadMin: 30, nudgeAfterDays: 3, rankingDay: "2026-11-09", ranking: [{ taskId: "t2", why: "Cash first." }] },
    today: [task({ id: "t1", title: "Pinned", pinnedToday: true }), task({ id: "t2", title: "Ranked" })],
  });
  const a = nextAction(d, now);
  assert.equal(a.kind, "task");
  assert.equal(a.title, "Ranked");
  assert.equal(a.detail, "Cash first.");
});

test("pinned beats first when there is no ranking", () => {
  const d = payload({ today: [task({ id: "t1", title: "First" }), task({ id: "t2", title: "Pinned", pinnedToday: true })] });
  assert.equal(nextAction(d, now).title, "Pinned");
});

test("only stale tasks left: done or drop", () => {
  const d = payload({ today: [task({ id: "t1", title: "Launch promo through Nov 7 2026" })] });
  const a = nextAction(d, now);
  assert.equal(a.kind, "stale");
  assert.match(a.detail, /^That date was 1 day ago/);
});

test("nothing at all falls back to the week's open outcome, then to 'Nothing due.'", () => {
  assert.equal(nextAction(payload({ week: { outcomes: [{ text: "Close 2 clients", done: false }] } }), now).title, "Close 2 clients");
  assert.equal(nextAction(payload(), now).title, "Nothing due.");
});
