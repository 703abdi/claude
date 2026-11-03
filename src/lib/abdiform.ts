import type { AbdiformResult } from "@/lib/abdiform-types";

export async function fetchAbdiformMetrics(): Promise<AbdiformResult> {
  const base = process.env.ABDIFORM_URL;
  const token = process.env.ABDIFORM_METRICS_TOKEN;
  if (!base || !token) return { configured: false };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { configured: true, error: `abdiform responded ${res.status}` };
    return { configured: true, data: await res.json() };
  } catch (err) {
    return { configured: true, error: err instanceof Error ? err.message : "abdiform unreachable" };
  }
}
