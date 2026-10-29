"use client";

import { useRef, useState } from "react";

export default function ClaudeUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setStatus("Parsing and uploading...");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/connectors/claude/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus(`Failed: ${err.error ?? res.statusText}`);
        return;
      }
      const data = await res.json();
      setStatus(
        `Ingested ${data.ingested} conversation(s). Extraction: ${data.extraction.processed} processed, ${data.extraction.suggestionsCreated} suggestion(s) created${data.extraction.skipped ? `, ${data.extraction.skipped} skipped (no ANTHROPIC_API_KEY)` : ""}.`
      );
    } catch (e) {
      setStatus(e instanceof Error ? `Error: ${e.message}` : "Could not read that file as JSON.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Anthropic has no public API for a third party to pull your Claude conversation history automatically. Export
        it yourself (claude.ai → Settings → Account → Export data), unzip it, then upload the{" "}
        <code>conversations.json</code> file here.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="text-xs font-semibold bg-foreground text-background rounded-md px-3 py-1.5 disabled:opacity-40"
      >
        {busy ? "Uploading..." : "Upload conversations.json"}
      </button>
      {status && <p className="text-xs text-muted-2">{status}</p>}
    </div>
  );
}
