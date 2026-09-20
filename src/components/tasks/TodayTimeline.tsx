"use client";

import type { Task } from "@/lib/types";

const START_HOUR = 6;
const END_HOUR = 22;
const RANGE_MIN = (END_HOUR - START_HOUR) * 60;

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function pct(minutesFromStart: number) {
  return Math.min(100, Math.max(0, (minutesFromStart / RANGE_MIN) * 100));
}

export default function TodayTimeline({
  tasks,
  selectedTaskId,
  onSelect,
}: {
  tasks: Task[];
  selectedTaskId?: string | null;
  onSelect: (task: Task) => void;
}) {
  const timed = tasks.filter((t) => t.dueTime);
  if (timed.length === 0) return null;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
  const showNow = nowMin >= 0 && nowMin <= RANGE_MIN;

  const hourMarks = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <div className="mb-4 border border-border rounded px-3 pt-3 pb-2">
      <div className="relative h-8 mb-1">
        {hourMarks.map((h) => (
          <span
            key={h}
            className="absolute top-0 bottom-0 w-px bg-border"
            style={{ left: `${pct((h - START_HOUR) * 60)}%` }}
          />
        ))}
        {showNow && (
          <span className="absolute top-0 bottom-0 w-px bg-accent z-10" style={{ left: `${pct(nowMin)}%` }}>
            <span className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-accent" />
          </span>
        )}
        {timed.map((t) => {
          const min = toMinutes(t.dueTime!) - START_HOUR * 60;
          const color = t.overdue ? "var(--overdue)" : t.category?.color || "var(--foreground)";
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              title={`${t.dueTime} — ${t.title}`}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border transition-transform hover:scale-125 ${
                selectedTaskId === t.id ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""
              }`}
              style={{ left: `${pct(min)}%`, backgroundColor: color, borderColor: color }}
            />
          );
        })}
      </div>
      <div className="relative h-3 font-mono text-[9px] text-muted-2">
        {hourMarks
          .filter((h) => h % 4 === 0)
          .map((h) => (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: `${pct((h - START_HOUR) * 60)}%` }}>
              {h % 12 === 0 ? 12 : h % 12}
              {h < 12 ? "a" : "p"}
            </span>
          ))}
      </div>
    </div>
  );
}
