"use client";

import type { HubPayload, ScoreField } from "@/lib/hub-types";
import Popup from "./Popup";

const NAME: Record<ScoreField, string> = { dials: "Dials", convos: "Convos", booked: "Booked", cashCents: "Cash" };
const PLAIN: Record<ScoreField, string> = {
  dials: "Calls you made.",
  convos: "Real conversations with a decision maker.",
  booked: "Calls or jobs booked on the calendar.",
  cashCents: "Money that actually landed in the account.",
};

/** Tap a scoreboard tile: this week, one bar per day, so you can see the shape of the week. */
export default function ScoreDetail({ field, week, todayKey, onClose }: { field: ScoreField | null; week: HubPayload["week"]; todayKey: string; onClose: () => void }) {
  const days = daysOfWeek(week.weekStart);
  const byDay = new Map(week.scoreboard.days.map((d) => [d.date, d]));
  const values = days.map((k) => byDay.get(k)?.[field ?? "convos"] ?? 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const fmt = (n: number) => (field === "cashCents" ? `$${Math.round(n / 100).toLocaleString()}` : n.toLocaleString());
  const pastDays = days.filter((k) => k <= todayKey).length || 1;
  const avg = total / pastDays;

  return (
    <Popup open={!!field} onClose={onClose} eyebrow="This week" title={field ? NAME[field] : ""}>
      {field && (
        <div className="space-y-4">
          <p className="text-[14px] text-muted">{PLAIN[field]}</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Week" value={fmt(total)} />
            <Stat label="Today" value={fmt(byDay.get(todayKey)?.[field] ?? 0)} />
            <Stat label="Per day" value={fmt(Math.round(avg))} />
          </div>
          <div className="tile p-3">
            <div className="flex h-28 items-end gap-1.5">
              {days.map((k, i) => {
                const v = values[i];
                const today = k === todayKey;
                const future = k > todayKey;
                return (
                  <div key={k} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <span className="font-mono text-[10px] text-muted-2">{v ? fmt(v) : ""}</span>
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        height: `${Math.max(v ? 8 : 2, (v / max) * 80)}px`,
                        background: today ? "var(--accent)" : future ? "var(--border)" : "color-mix(in srgb, var(--accent) 45%, var(--surface-hover))",
                      }}
                    />
                    <span className={`font-mono text-[10px] ${today ? "font-bold text-accent" : "text-muted-2"}`}>{dayLabel(k)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="font-mono text-[11px] text-muted-2">Add to today with the + on the tile. The week adds up on its own.</p>
        </div>
      )}
    </Popup>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile flex flex-col p-3">
      <span className="eyebrow">{label}</span>
      <span className="mt-1 font-mono text-[20px] font-bold leading-none">{value}</span>
    </div>
  );
}

function daysOfWeek(startKey: string) {
  const [y, m, d] = startKey.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return dt.toISOString().slice(0, 10);
  });
}

function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
