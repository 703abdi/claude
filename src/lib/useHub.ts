"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HubPayload } from "@/lib/hub-types";

function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

export type HubPatch = (d: HubPayload) => HubPayload;

/** Single source of truth for the Hub. Polls every `intervalMs` while the tab is
 * visible, refetches on focus / tab show, and pauses while hidden. Mutations are
 * applied optimistically, then the server copy is refetched. */
export function useHub(intervalMs = 8000) {
  const [data, setData] = useState<HubPayload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [changedAt, setChangedAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const version = useRef<string | null>(null);
  const seq = useRef(0); // bumps on every optimistic change, so stale polls are dropped
  const pending = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const startSeq = seq.current;
    setLoading(true);
    const run = (async () => {
      try {
        const tz = browserTz();
        const res = await fetch(`/api/hub${tz ? `?tz=${encodeURIComponent(tz)}` : ""}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as HubPayload;
        setError(false);
        setUpdatedAt(Date.now());
        // A mutation started while this request was out: its optimistic state wins
        // until the follow-up refetch lands.
        if (pending.current > 0 || seq.current !== startSeq) return;
        if (version.current && version.current !== next.version) setChangedAt(Date.now());
        version.current = next.version;
        setData(next);
      } catch {
        setError(true); // keep the last good snapshot
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    await load();
  }, [load]);

  useEffect(() => {
    // Initial fetch; setState happens after the response, not synchronously.
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, load]);

  /** Apply `patch` now, run `action`, optionally reconcile with its result, then refetch.
   * On failure the refetch rolls the optimistic change back. */
  const mutate = useCallback(
    async <R,>(patch: HubPatch | null, action?: () => Promise<R>, reconcile?: (d: HubPayload, result: R) => HubPayload) => {
      seq.current++;
      if (patch) setData((d) => (d ? patch(d) : d));
      if (!action) return undefined;
      pending.current++;
      let result: R | undefined;
      let failed = false;
      try {
        result = await action();
        if (reconcile) setData((d) => (d ? reconcile(d, result as R) : d));
      } catch {
        failed = true;
      } finally {
        pending.current--;
      }
      seq.current++;
      if (inFlight.current) await inFlight.current;
      await load();
      if (failed) throw new Error("mutation failed");
      return result;
    },
    [load]
  );

  return { data, updatedAt, changedAt, loading, error, refresh, mutate };
}
