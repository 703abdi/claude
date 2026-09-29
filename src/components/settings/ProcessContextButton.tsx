"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProcessContextButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await fetch("/api/context/process", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={run} disabled={busy} className="text-xs text-muted hover:text-foreground disabled:opacity-40">
      {busy ? "Processing..." : "Process now"}
    </button>
  );
}
