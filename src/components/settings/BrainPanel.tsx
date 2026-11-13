"use client";

import { useEffect, useState } from "react";
import type { Policy } from "@/lib/policy";

type Bounds = Record<string, { min: number; max: number }>;
type Payload = {
  version: number;
  policy: Policy;
  reason: string | null;
  author: string;
  createdAt: string | null;
  bounds: Bounds;
  labels: Record<string, string>;
  history: { version: number; reason: string | null; author: string; createdAt: string }[];
  status: { configured: boolean; lastRunAt: string | null; lastStatus: string | null; lastError: string | null; lastPost: { title: string; body: string | null; at: string } | null };
};

/** The knobs the brain turns, who turned them last and why, the last pass, Run now, Roll back. */
export default function BrainPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, number | boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/brain", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Payload | null) => {
        if (alive && j) {
          setData(j);
          setDraft({});
        }
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [reload]);

  async function post(url: string, body?: unknown, label?: string) {
    setBusy(label ?? url);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json();
      if (!res.ok) setMsg(j.error ?? "That didn't work.");
      else if (j.result?.error) setMsg(j.result.error);
      else if (j.result?.skipped) setMsg(`Skipped: ${j.result.skipped}.`);
      else if (j.result) setMsg(`Done. ${j.result.ranked} picked for ${j.result.targetKey}, ${Object.keys(j.result.knobs ?? {}).length} knobs turned.`);
      else setMsg(`Saved as version ${j.version}.`);
      setReload((k) => k + 1);
    } catch {
      setMsg("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="text-xs text-muted-2">Checking…</p>;
  const knobs = Object.keys(data.bounds);
  const dirty = Object.keys(draft).length > 0;
  const val = (k: string) => (k in draft ? draft[k] : data.policy[k as keyof Policy]);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => post("/api/brain?run=1", undefined, "run")} disabled={busy !== null || !data.status.configured} className="btn-primary h-9 px-4 text-xs">
          {busy === "run" ? "Thinking…" : "Run the pass now"}
        </button>
        <button onClick={() => post("/api/brain?rollback=1", undefined, "rollback")} disabled={busy !== null || data.version < 1} className="btn-ghost h-9 px-3 text-xs">
          Roll back
        </button>
        <span className="font-mono text-[11px] text-muted-2">
          policy v{data.version} · {data.author}
          {data.createdAt ? ` · ${new Date(data.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
        </span>
      </div>
      {!data.status.configured && <p className="text-xs text-danger">ANTHROPIC_API_KEY is not set, so the pass cannot run.</p>}
      {msg && <p className="text-xs text-muted">{msg}</p>}

      <ul className="grid gap-2 sm:grid-cols-2">
        {knobs.map((k) => (
          <li key={k} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2">
            <span className="text-xs text-muted">{data.labels[k] ?? k}</span>
            <input
              type="number"
              min={data.bounds[k].min}
              max={data.bounds[k].max}
              value={Number(val(k))}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: Number(e.target.value) }))}
              className="type-box w-20 bg-surface px-2 py-1 text-right font-mono text-xs outline-none"
            />
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2">
          <span className="text-xs text-muted">{data.labels.dialNudge}</span>
          <input type="checkbox" checked={Boolean(val("dialNudge"))} onChange={(e) => setDraft((d) => ({ ...d, dialNudge: e.target.checked }))} className="h-4 w-4" />
        </li>
      </ul>
      {dirty && (
        <div className="flex items-center gap-3">
          <button onClick={() => post("/api/brain", { changes: draft }, "save")} disabled={busy !== null} className="btn-primary h-9 px-4 text-xs">
            {busy === "save" ? "Saving…" : "Save knobs"}
          </button>
          <button onClick={() => setDraft({})} className="btn-ghost h-9 px-3 text-xs">
            Cancel
          </button>
        </div>
      )}

      {data.status.lastPost && (
        <div className="rounded-2xl border border-border bg-surface-2 px-3 py-3">
          <p className="eyebrow mb-1">Last pass · {new Date(data.status.lastPost.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
          <p className="font-semibold">{data.status.lastPost.title}</p>
          {data.status.lastPost.body && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{data.status.lastPost.body}</p>}
        </div>
      )}
      {data.status.lastError && <p className="text-xs text-danger">Last run failed: {data.status.lastError}</p>}

      {data.history.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Policy history</summary>
          <ul className="mt-2 space-y-1">
            {data.history.map((h) => (
              <li key={h.version} className="flex gap-2">
                <span className="shrink-0 font-mono text-muted-2">v{h.version}</span>
                <span className="shrink-0 text-muted-2">{h.author}</span>
                <span className="min-w-0 truncate">{h.reason ?? ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
