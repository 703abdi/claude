"use client";

import { useEffect, useState } from "react";

type Status = { configured: boolean; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncError: string | null };
type Result = { calls?: number; tasks?: number; waiting?: number; skipped?: string; error?: string };

export default function FathomSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/fathom/sync", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Status | null) => alive && j && setStatus(j))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);

  async function syncNow() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/fathom/sync", { method: "POST" });
      const j = (await res.json()) as { result: Result; status: Status };
      setResult(j.result);
      setStatus(j.status);
    } catch {
      setResult({ error: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <p className="text-xs text-muted-2">Checking…</p>;

  return (
    <div className="space-y-3">
      {!status.configured ? (
        <div className="text-xs text-muted">
          <p className="text-warn">FATHOM_API_KEY is not set.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>In Fathom, open Settings, then API, and create a key.</li>
            <li>In Vercel: Project, Settings, Environment Variables, add FATHOM_API_KEY, then redeploy.</li>
            <li>Come back here and press Sync now. After that it pulls on its own every 30 minutes.</li>
          </ol>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Connected.{" "}
          {status.lastSyncAt ? `Last pull ${new Date(status.lastSyncAt).toLocaleString()} (${status.lastSyncStatus}).` : "Not pulled yet."}
          {status.lastSyncError && <span className="text-danger"> {status.lastSyncError}</span>}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button onClick={syncNow} disabled={busy || !status.configured} className="btn-primary h-10 px-4 text-sm">
          {busy ? "Pulling…" : "Sync now"}
        </button>
        {result && (
          <span className="text-xs text-muted">
            {result.error
              ? result.error
              : result.skipped
                ? `Skipped (${result.skipped})`
                : `${result.calls} new call${result.calls === 1 ? "" : "s"}, ${result.tasks} task${result.tasks === 1 ? "" : "s"} for you, ${result.waiting} waiting on others`}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-2">
        Your action items land in Today. Items someone else promised become Waiting on that person, if they are in People. The call itself shows in the agent feed with its link.
      </p>
    </div>
  );
}
