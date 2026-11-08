/** Browser side of the signal log. Swallows every error: tracking never breaks the UI. */
export function track(kind: string, ref: string | null, data?: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ kind, ref, data });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/signals", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => null);
  } catch {
    /* ignore */
  }
}
