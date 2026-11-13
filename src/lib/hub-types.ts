import type { AbdiformResult } from "@/lib/abdiform-types";
import type { CalendarEvent, Category, MorningBrief, Task } from "@/lib/types";

export type Outcome = { text: string; done: boolean };

export type ScoreTotals = { dials: number; convos: number; booked: number; cashCents: number };
export type ScoreField = keyof ScoreTotals;

export type InboxItem = {
  id: string;
  agent: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  taskId: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type WaitingGroup = {
  person: { id: string; name: string };
  tasks: { id: string; title: string; waitingAt: string | null; followUpDate: string | null }[];
};

export type GoalView = {
  id: string;
  label: string;
  targetCents: number;
  startDate: string;
  deadline: string;
  collectedCents: number;
  daysLeft: number;
};

import type { Policy } from "@/lib/policy";

export type HubPayload = {
  now: string;
  /** The live knobs behind the ranking (version is in policyVersion). */
  policy: Policy;
  policyVersion: number;
  tz: string;
  todayKey: string;
  version: string;
  today: Task[];
  upNext: CalendarEvent[];
  feeds: { count: number; errors: string[] };
  waitingOn: WaitingGroup[];
  week: {
    weekStart: string; // YYYY-MM-DD (Sunday)
    weekEnd: string; // YYYY-MM-DD (Saturday)
    outcomes: Outcome[];
    scoreboard: { today: ScoreTotals; week: ScoreTotals; days: (ScoreTotals & { date: string })[] };
    goal: GoalView;
  };
  stats: { open: number; overdue: number; dueToday: number; waiting: number; doneToday: number };
  inbox: InboxItem[];
  brief: MorningBrief | null;
  metrics: AbdiformResult;
  categories: Category[];
  people: { id: string; name: string }[];
};
