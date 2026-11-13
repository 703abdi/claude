"use client";

import { useEffect, useState } from "react";
import type { SourceStatus } from "@/lib/sources";
import CalendarFeeds from "./CalendarFeeds";

type Payload = { sources: SourceStatus[]; zapierUrl: string };

const GROUPS = ["Calls and calendar", "Pipeline", "Money", "Audience", "Agents and brain", "Reach you"] as const;

/** Every source that can feed the Hub: connected or not, what it gives, how to set it up, Sync now. */
export default function SourcesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [reload, setReload] = useState(0);
  const [googleNote, setGoogleNote] = useState<string | null>(null);

  // Back from Google's consent screen: /settings?google=connected|denied:...|error:...
  function readGoogleReturn() {
    const g = new URLSearchParams(window.location.search).get("google");
    if (!g) return;
    setGoogleNote(
      g === "connected" ? "Google connected. First pull done." : g === "missing-keys" ? "Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first." : g === "bad-state" ? "That link expired. Try Connect Google again." : g.startsWith("denied") ? "You said no on Google's screen." : g.replace(/^error:/, ""),
    );
    setOpen("google");
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function disconnectGoogle() {
    if (!confirm("Disconnect Google? Pulled events stay until the next pull removes them.")) return;
    setBusy("google");
    try {
      await fetch("/api/google/sync", { method: "DELETE" });
      setGoogleNote("Disconnected.");
      setReload((k) => k + 1);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/sources", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Payload | null) => {
        if (!alive || !j) return;
        setData(j);
        readGoogleReturn();
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [reload]);

  async function syncNow(s: SourceStatus) {
    if (!s.syncUrl) return;
    setBusy(s.id);
    try {
      const res = await fetch(s.syncUrl, { method: "POST" });
      const j = await res.json();
      const r = j.result ?? j;
      setMsg((m) => ({
        ...m,
        [s.id]: r.error ? r.error : r.skipped ? `Skipped (${r.skipped})` : `Pulled: ${Object.entries(r).map(([k, v]) => `${v} ${k}`).join(", ")}`,
      }));
      setReload((k) => k + 1);
    } catch {
      setMsg((m) => ({ ...m, [s.id]: "Couldn't reach the server." }));
    } finally {
      setBusy(null);
    }
  }

  async function sendDigest(which: "morning" | "evening" | "weekly") {
    setBusy(`digest-${which}`);
    try {
      const res = await fetch(`/api/digests?which=${which}`, { method: "POST" });
      const j = await res.json();
      setMsg((m) => ({ ...m, email: j.emailed ? `${which} digest sent by email and posted to the feed.` : `${which} digest posted to the feed (no email: set RESEND_API_KEY and DIGEST_TO).` }));
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="text-xs text-muted-2">Checking…</p>;
  const on = data.sources.filter((s) => s.configured).length;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">
        {on} of {data.sources.length} connected. Keys go in Vercel (project claude, Settings, Environment Variables, Production), then Redeploy. Names are exact.
      </p>
      {GROUPS.map((g) => {
        const rows = data.sources.filter((s) => s.group === g);
        if (!rows.length) return null;
        return (
          <div key={g}>
            <p className="eyebrow mb-2">{g}</p>
            <ul className="space-y-1">
              {rows.map((s) => {
                const isOpen = open === s.id;
                return (
                  <li key={s.id} className="rounded-2xl border border-border bg-surface-2">
                    <button onClick={() => setOpen(isOpen ? null : s.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${s.configured ? "bg-ok" : s.built ? "bg-muted-2" : "bg-border-2"}`} />
                        <span className="truncate text-sm font-semibold">{s.name}</span>
                        {!s.built && <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold text-muted-2">phase {s.phase}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-2">
                        {s.configured ? (s.lastSyncAt ? `pulled ${timeAgo(s.lastSyncAt)}` : "connected") : s.needsConnect ? "connect" : s.built ? "not set" : "not built yet"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2 border-t border-border px-3 py-3 text-xs text-muted">
                        <p className="text-foreground">{s.gives}</p>
                        {s.env.length > 0 && (
                          <p>
                            Keys:{" "}
                            {s.env.map((e, i) => (
                              <code key={i} className="mr-1 rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                                {Array.isArray(e) ? e[0] : e}
                              </code>
                            ))}
                          </p>
                        )}
                        <p>{s.setup}</p>
                        {s.lastSyncError && <p className="text-danger">{s.lastSyncError}</p>}
                        {s.custom === "feeds" && <CalendarFeeds />}
                        {s.custom === "google" && (
                          <div className="space-y-2 pt-1">
                            {googleNote && <p className="text-foreground">{googleNote}</p>}
                            {s.needsConnect && (
                              <a href="/api/google/auth" className="btn-primary inline-flex h-9 items-center px-4 text-xs">
                                Connect Google
                              </a>
                            )}
                            {s.configured && (
                              <p className="flex flex-wrap items-center gap-3">
                                <span>Connected as {s.account ?? "your Google account"}.</span>
                                <button onClick={disconnectGoogle} disabled={busy !== null} className="btn-ghost h-8 px-3 text-xs">
                                  Disconnect
                                </button>
                              </p>
                            )}
                          </div>
                        )}
                        {s.custom === "zapier" && (
                          <div className="space-y-1.5">
                            <p>In Zapier: Webhooks by Zapier, POST, this URL, JSON body with title, body, kind (task or update), person, due.</p>
                            <code className="block break-all rounded-xl bg-surface-hover px-3 py-2 font-mono text-[11px] text-foreground">{data.zapierUrl}</code>
                          </div>
                        )}
                        {s.id === "email" && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {(["morning", "evening", "weekly"] as const).map((w) => (
                              <button key={w} onClick={() => sendDigest(w)} disabled={busy !== null} className="btn-ghost h-9 px-3 text-xs">
                                {busy === `digest-${w}` ? "Sending…" : `Send ${w} now`}
                              </button>
                            ))}
                            {msg.email && <p className="w-full text-muted">{msg.email}</p>}
                          </div>
                        )}
                        {s.syncUrl && s.configured && (
                          <div className="flex items-center gap-3 pt-1">
                            <button onClick={() => syncNow(s)} disabled={busy !== null} className="btn-primary h-9 px-4 text-xs">
                              {busy === s.id ? "Pulling…" : "Sync now"}
                            </button>
                            {msg[s.id] && <span>{msg[s.id]}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
