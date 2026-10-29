"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DEST_LABEL, type Dest } from "@/lib/agents/city";
import type { AgentView } from "@/lib/agents/types";
import type { TownSummary } from "@/lib/town-summary";

const DEST_HREF: Record<Dest, string> = {
  tasks: "/tasks",
  calendar: "/calendar",
  people: "/people",
  metrics: "/metrics",
};

function useSummary() {
  const [summary, setSummary] = useState<TownSummary | null>(null);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/town/summary", { cache: "no-store" });
        if (res.ok && alive) setSummary(await res.json());
      } catch {
        // keep last good snapshot
      }
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return summary;
}

export default function DestPanel({ dest, agents }: { dest: Dest; agents: AgentView[] }) {
  const summary = useSummary();
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-2 font-mono uppercase">building</div>
          <div className="text-lg font-semibold">{DEST_LABEL[dest]}</div>
        </div>
        <Link href={DEST_HREF[dest]} className="text-xs text-accent hover:underline shrink-0">
          Open page →
        </Link>
      </div>
      {!summary ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : dest === "tasks" ? (
        <TasksList summary={summary} agents={agents} />
      ) : dest === "calendar" ? (
        <CalendarList summary={summary} />
      ) : dest === "people" ? (
        <PeopleList summary={summary} />
      ) : (
        <MetricsHeadline summary={summary} />
      )}
    </div>
  );
}

function TasksList({ summary, agents }: { summary: TownSummary; agents: AgentView[] }) {
  const t = summary.tasks;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="open" value={t.open} />
        <Stat label="overdue" value={t.overdue} />
        <Stat label="today" value={t.dueToday} />
      </div>
      {t.items.length === 0 ? (
        <p className="text-sm text-muted">No open tasks.</p>
      ) : (
        <ul className="space-y-2">
          {t.items.map((task) => (
            <TaskRow key={task.id} id={task.id} title={task.title} agents={agents} />
          ))}
        </ul>
      )}
    </>
  );
}

function TaskRow({ id, title, agents }: { id: string; title: string; agents: AgentView[] }) {
  const [chosen, setChosen] = useState("");
  const [sent, setSent] = useState(false);
  const agentId = chosen || agents[0]?.id || "";

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!agentId) return;
    const res = await fetch(`/api/agents/${agentId}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: title, taskId: id }),
    });
    if (res.ok) setSent(true);
  }

  return (
    <li className="rounded-lg border border-border p-2.5">
      <div className="text-sm font-medium line-clamp-2">{title}</div>
      {agents.length === 0 ? (
        <p className="text-xs text-muted-2 mt-1">Add an agent in Hub to run this.</p>
      ) : (
        <form onSubmit={send} className="mt-2 flex items-center gap-2">
          <select
            value={agentId}
            onChange={(e) => setChosen(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">
            {sent ? "Sent" : "Run"}
          </button>
        </form>
      )}
    </li>
  );
}

function CalendarList({ summary }: { summary: TownSummary }) {
  const items = summary.calendar.items;
  if (items.length === 0) return <p className="text-sm text-muted">Nothing on the calendar.</p>;
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className="rounded-lg border border-border px-3 py-2">
          <div className="text-sm font-medium">{e.title}</div>
          <div className="text-xs text-muted-2 font-mono">
            {new Date(e.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            {e.startTime ? ` · ${e.startTime}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}

function PeopleList({ summary }: { summary: TownSummary }) {
  const p = summary.people;
  return (
    <>
      <Stat label="people" value={p.count} />
      <ul className="flex flex-wrap gap-1.5">
        {p.names.map((n) => (
          <li key={n.id} className="text-xs px-2.5 py-1 rounded-full border border-border bg-surface text-muted">
            {n.name}
          </li>
        ))}
      </ul>
    </>
  );
}

function MetricsHeadline({ summary }: { summary: TownSummary }) {
  const m = summary.metrics;
  if (!m.configured) {
    return (
      <p className="text-sm text-muted">
        abdiform is not connected yet. Set ABDIFORM_URL and ABDIFORM_METRICS_TOKEN to see its numbers here.
      </p>
    );
  }
  if (!("data" in m)) return <p className="text-sm text-overdue">{m.error}</p>;
  const o = m.data.overview;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="responses" value={o.total} />
      <Stat label="today" value={o.today} />
      <Stat label="last 7 days" value={o.last7} />
      <Stat label="completion" value={o.completion === null ? "—" : `${Math.round(o.completion * 100)}%`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-2">
      <div className="text-[11px] text-muted-2">{label}</div>
      <div className="text-lg font-bold font-mono">{value}</div>
    </div>
  );
}
