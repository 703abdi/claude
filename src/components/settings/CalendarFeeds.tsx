"use client";

import { useEffect, useState } from "react";

type Status = { feeds: string[]; count: number; events: number; errors: string[] };

export default function CalendarFeeds() {
  const [status, setStatus] = useState<Status | null>(null);
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/calendar-feeds", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Status | null) => alive && j && setStatus(j))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [reloadKey]);
  const load = () => setReloadKey((k) => k + 1);

  async function save() {
    setBusy(true);
    setError(null);
    const urls = value
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/calendar-feeds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("One of those is not a valid feed URL. Paste the full https:// or webcal:// address.");
      return;
    }
    setValue("");
    setEditing(false);
    load();
  }

  return (
    <div className="space-y-3">
      {status === null ? (
        <p className="text-xs text-muted-2">Checking…</p>
      ) : status.count === 0 && !editing ? (
        <p className="text-sm text-muted">No feeds yet. Add your Google Calendar and its events show up in the Hub on their own.</p>
      ) : (
        !editing && (
          <ul className="space-y-1.5">
            {status.feeds.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 font-mono text-[12px] text-muted">
                <span className="truncate">{f}</span>
                <span className="shrink-0 text-ok">connected</span>
              </li>
            ))}
            <li className="px-1 text-[11px] text-muted-2">
              {status.events} events in the next 45 days
              {status.errors.length > 0 && <span className="text-danger"> · {status.errors.join("; ")}</span>}
            </li>
          </ul>
        )
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            placeholder={"https://calendar.google.com/calendar/ical/.../basic.ics\nOne URL per line. This replaces the current list."}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="btn-primary h-10 px-4 text-sm">
              {busy ? "Saving…" : "Save feeds"}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost h-10 px-4 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setValue("");
            setEditing(true);
          }}
          className="btn-ghost h-10 px-4 text-sm"
        >
          {status?.count ? "Replace feeds" : "Add a feed"}
        </button>
      )}

      <details className="text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-foreground">How to get your Google Calendar link</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Open calendar.google.com on a computer, hover your calendar on the left, click the three dots, then Settings and sharing.</li>
          <li>Scroll to Integrate calendar and copy the Secret address in iCal format.</li>
          <li>Paste it here. Calendly bookings already land on that calendar, so they come along.</li>
        </ol>
        <p className="mt-2">The link is a secret. Anyone with it can read your calendar, so it is stored here only and never shown in full.</p>
      </details>
    </div>
  );
}
