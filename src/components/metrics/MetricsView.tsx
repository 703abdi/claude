"use client";

import { useEffect, useState } from "react";
import type { AbdiformForm, AbdiformMetrics, AbdiformResult } from "@/lib/abdiform-types";

function pct(v: number | null) {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export default function MetricsView() {
  const [result, setResult] = useState<AbdiformResult | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/metrics/abdiform", { cache: "no-store" });
        if (res.ok && alive) setResult(await res.json());
      } catch {
        // keep last good snapshot
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Metrics</h1>
        <p className="text-sm text-muted">Live numbers from abdiform: forms, responses and conversion. Refreshes every minute.</p>
      </div>

      {!result ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !result.configured ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted space-y-2">
          <div className="font-semibold text-foreground">abdiform is not connected</div>
          <p>
            Set <code className="font-mono">ABDIFORM_URL</code> to your abdiform site and{" "}
            <code className="font-mono">ABDIFORM_METRICS_TOKEN</code> to the same value as abdiform&apos;s{" "}
            <code className="font-mono">METRICS_TOKEN</code>. The metrics endpoint is in the patch that ships with this change.
          </p>
        </div>
      ) : !("data" in result) ? (
        <div className="rounded-2xl border border-overdue/30 bg-overdue/10 p-5 text-sm text-overdue">
          Could not load abdiform metrics: {result.error}
        </div>
      ) : (
        <Dashboard data={result.data} />
      )}
    </div>
  );
}

function Dashboard({ data }: { data: AbdiformMetrics }) {
  const o = data.overview;
  const delta = o.last7 - o.prev7;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="Responses" value={o.total} />
        <Card label="Today" value={o.today} />
        <Card label="Last 7 days" value={o.last7} sub={`${delta >= 0 ? "+" : ""}${delta} vs prior week`} />
        <Card label="Completion" value={pct(o.completion)} sub="responses ÷ views" />
        <Card label="Win rate" value={pct(o.winRate)} sub="won ÷ responses" />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold mb-3">Responses per day · last 30 days</h2>
        <Timeline points={data.timeline} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold mb-3">Lead status</h2>
          <ul className="space-y-2">
            {Object.entries(o.byStatus).map(([status, count]) => (
              <li key={status} className="flex items-center gap-3 text-sm">
                <span className="w-24 capitalize text-muted">{status}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${o.total ? Math.round((count / o.total) * 100) : 0}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono">{count}</span>
              </li>
            ))}
          </ul>
          {o.partials > 0 && <p className="mt-3 text-xs text-muted-2">{o.partials} unfinished responses not counted.</p>}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold mb-3">Forms</h2>
          {data.forms.length === 0 ? (
            <p className="text-sm text-muted">No forms yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-2 text-left">
                <tr>
                  <th className="py-2 font-medium">Form</th>
                  <th className="py-2 font-medium text-right">Views</th>
                  <th className="py-2 font-medium text-right">Responses</th>
                  <th className="py-2 font-medium text-right">New</th>
                  <th className="py-2 font-medium text-right">Done</th>
                  <th className="py-2 font-medium text-right">Last</th>
                </tr>
              </thead>
              <tbody>
                {data.forms.map((f) => (
                  <FormRow key={f.id} form={f} />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <p className="text-xs text-muted-2 font-mono">generated {new Date(data.generated_at).toLocaleString()}</p>
    </>
  );
}

function FormRow({ form: f }: { form: AbdiformForm }) {
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-3">
        <div className="font-medium truncate max-w-[16rem]">{f.title || "Untitled"}</div>
        <div className="text-xs text-muted-2">{f.status}</div>
      </td>
      <td className="py-2 text-right font-mono">{f.views}</td>
      <td className="py-2 text-right font-mono">{f.count}</td>
      <td className="py-2 text-right font-mono">{f.newCount}</td>
      <td className="py-2 text-right font-mono">{pct(f.completion)}</td>
      <td className="py-2 text-right text-xs text-muted-2">{ago(f.last)}</td>
    </tr>
  );
}

function Card({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted-2">{label}</div>
      <div className="text-2xl font-bold font-mono">{value}</div>
      {sub && <div className="text-[11px] text-muted-2 mt-0.5">{sub}</div>}
    </div>
  );
}

function Timeline({ points }: { points: { day: string; label: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const w = 300;
  const h = 90;
  const gap = 2;
  const bw = w / points.length - gap;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" role="img" aria-label="Responses per day">
      {points.map((p, i) => {
        const bh = Math.max(p.count > 0 ? 2 : 0, (p.count / max) * (h - 8));
        return (
          <rect
            key={p.day}
            x={i * (bw + gap)}
            y={h - bh}
            width={bw}
            height={bh}
            rx={1.5}
            style={{ fill: "var(--accent)", opacity: p.count > 0 ? 0.9 : 0.2 }}
          >
            <title>{`${p.label}: ${p.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
