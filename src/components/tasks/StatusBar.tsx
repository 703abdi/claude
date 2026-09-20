"use client";

import { useEffect, useState } from "react";

export default function StatusBar({
  total,
  completed,
  totalAll,
  overdue,
  waiting,
}: {
  total: number;
  completed: number;
  totalAll: number;
  overdue: number;
  waiting: number;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pct = totalAll === 0 ? 0 : Math.round((completed / totalAll) * 100);
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div className="hidden lg:flex fixed bottom-0 inset-x-0 h-8 border-t border-border bg-surface z-30 items-center px-4 font-mono text-[11px] text-muted-2 tabular-nums">
      <div className="flex items-center gap-4">
        <span>{total} ACTIVE</span>
        <span className={overdue > 0 ? "text-overdue" : undefined}>{overdue} OVERDUE</span>
        <span>{waiting} WAITING</span>
        <span>
          {completed}/{totalAll} DONE ({pct}%)
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Synced" />
        <span className="text-foreground" suppressHydrationWarning>
          {time}
        </span>
      </div>
    </div>
  );
}
