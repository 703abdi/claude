import type { AbdiformResult } from "@/lib/abdiform-types";

export type TownSummary = {
  tasks: {
    open: number;
    overdue: number;
    dueToday: number;
    items: { id: string; title: string; dueDate: string | null }[];
  };
  calendar: { items: { id: string; title: string; date: string; startTime: string | null }[] };
  people: { count: number; names: { id: string; name: string }[] };
  metrics: AbdiformResult;
};
