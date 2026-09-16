"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DailyRefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/daily-refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error ?? "Failed");
        return;
      }
      setResult(
        `Context: ${data.extraction.processed} processed, ${data.extraction.suggestionsCreated} new suggestion(s). Rule-based: ${data.suggestions.created} new. Priorities updated for ${data.priorities.updated}/${data.priorities.total} active tasks. New brief generated.`
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={busy}
        className="text-xs font-semibold bg-foreground text-background rounded-md px-3 py-1.5 disabled:opacity-40"
      >
        {busy ? "Running..." : "Run daily refresh now"}
      </button>
      {result && <p className="text-xs text-muted-2">{result}</p>}
    </div>
  );
}
