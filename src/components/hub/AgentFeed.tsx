"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RunStatus, RunView } from "@/lib/agents/types";
import type { InboxItem } from "@/lib/hub-types";
import { Card, CardTitle, Chip, agentColor, ago, useNow } from "./hub-ui";

const RUN_DOT: Record<RunStatus, string> = {
  QUEUED: "var(--warn)",
  RUNNING: "var(--accent)",
  DONE: "var(--ok)",
  FAILED: "var(--danger)",
};

type Entry = { kind: "inbox"; at: string; item: InboxItem } | { kind: "run"; at: string; run: RunView };

export default function AgentFeed({
  inbox,
  runs,
  onResolve,
}: {
  inbox: InboxItem[];
  runs: RunView[];
  onResolve: (item: InboxItem, action: "task" | "dismiss") => void;
}) {
  const now = useNow(30_000) ?? undefined;
  const reduced = useReducedMotion();
  const entries: Entry[] = [
    ...inbox.map((item) => ({ kind: "inbox" as const, at: item.createdAt, item })),
    ...runs.slice(0, 15).map((run) => ({ kind: "run" as const, at: run.createdAt, run })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25);

  return (
    <Card>
      <CardTitle label="Agent feed" right={<span className="font-mono text-[12px] text-accent">{inbox.length ? `${inbox.length} new` : ""}</span>} />
      {entries.length === 0 ? (
        <p className="py-4 text-sm text-muted">
          No agent updates yet. Point your agents at <code className="font-mono text-accent">/api/inbox</code> (see docs/agent-api.md).
        </p>
      ) : (
        <ol className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {entries.map((e) => {
              if (e.kind === "run") {
                const r = e.run;
                return (
                  <motion.li
                    key={`run-${r.id}`}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex gap-3 rounded-xl px-2 py-1.5"
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: RUN_DOT[r.status] }} />
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-muted-2">
                        {r.agentName} · run {r.status.toLowerCase()} · {ago(r.createdAt, now)}
                      </div>
                      <p className="line-clamp-2 text-sm">{r.prompt}</p>
                      {r.error && <p className="mt-0.5 line-clamp-1 text-xs text-danger">{r.error}</p>}
                    </div>
                  </motion.li>
                );
              }
              const it = e.item;
              const color = agentColor(it.agent);
              return (
                <motion.li
                  key={`inbox-${it.id}`}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: -16, boxShadow: "inset 2px 0 0 rgba(230,180,80,1)" }}
                  animate={{ opacity: 1, y: 0, boxShadow: "inset 2px 0 0 rgba(230,180,80,0)" }}
                  exit={{ opacity: 0, height: 0, x: 24 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], boxShadow: { duration: 0.8, ease: "easeOut" } }}
                  className="rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                      {it.agent}
                    </Chip>
                    <span className="font-mono text-[11px] text-muted-2">
                      {it.kind} · {ago(it.createdAt, now)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {it.link ? (
                      <a href={it.link} target="_blank" rel="noreferrer noopener" className="text-info hover:underline">
                        {it.title}
                      </a>
                    ) : (
                      it.title
                    )}
                  </p>
                  {it.body && <p className="mt-0.5 line-clamp-2 text-[14px] text-muted">{it.body}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    {it.taskId ? (
                      <Link href={`/tasks?highlight=${it.taskId}`} className="btn-ghost h-8 px-3 text-xs">
                        Open task
                      </Link>
                    ) : (
                      <button onClick={() => onResolve(it, "task")} className="btn-primary min-h-8 h-8 px-3 text-xs">
                        Make task
                      </button>
                    )}
                    <button onClick={() => onResolve(it, "dismiss")} className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-hover hover:text-foreground">
                      {it.taskId ? "Clear" : "Dismiss"}
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </Card>
  );
}
