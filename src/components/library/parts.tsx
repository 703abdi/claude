import Link from "next/link";
import type { ReactNode } from "react";

export type Crumb = { label: string; href?: string };

/** Library / Content / Agency SOPs / Hooks and scripts. The last crumb is the current page. */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-2">
          {i > 0 && <span className="text-muted-2">/</span>}
          {c.href ? (
            <Link href={c.href} className="break-words hover:text-foreground">
              {c.label}
            </Link>
          ) : (
            <span className="break-words text-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export type Box = { href: string; label: string; blurb?: string; count?: number; accent?: boolean };

/** The flat tile every Library box and card uses: same radius, border and hover. */
export const TILE = "tile transition-colors hover:border-border-2 hover:bg-surface-hover";

/** Flat bordered tiles in a grid. One level only: nothing boxed inside them. */
export function BoxGrid({ boxes }: { boxes: Box[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boxes.map((b) => (
        <li key={b.href} className="min-w-0">
          <Link href={b.href} className={`${TILE} flex h-full min-h-[96px] flex-col justify-between gap-3 p-4`}>
            <span className="min-w-0">
              <span className={`block break-words text-[16px] font-semibold ${b.accent ? "text-accent" : ""}`}>{b.label}</span>
              {b.blurb && <span className="mt-1 block text-[13px] leading-snug text-muted">{b.blurb}</span>}
            </span>
            {b.count !== undefined && (
              <span className="font-mono text-[11px] text-muted-2">
                {b.count} {b.count === 1 ? "item" : "items"}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Small muted kind tag. Takes the label, so this file stays free of server imports (client components use it). */
export function KindTag({ label }: { label: string }) {
  return <span className="lib-tag">{label}</span>;
}

const ICONS: Record<string, ReactNode> = {
  what: (
    <>
      <rect x="3.5" y="2" width="9" height="12" rx="1.5" />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
    </>
  ),
  from: (
    <>
      <circle cx="4" cy="4" r="1.6" />
      <circle cx="4" cy="12" r="1.6" />
      <circle cx="12" cy="8" r="1.6" />
      <path d="M5.5 4.6 10.4 7.4M5.5 11.4l4.9-2.8" />
    </>
  ),
  does: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M6.8 5.6 10.2 8l-3.4 2.4z" />
    </>
  ),
};

/** "What this is / Where it came from / What it does": three columns side by side, a swipe row on phones. */
export function ExplainRow({ summary, origin, purpose }: { summary: string | null; origin: string | null; purpose: string | null }) {
  const blocks = [
    { key: "what", label: "What this is", text: summary },
    { key: "from", label: "Where it came from", text: origin },
    { key: "does", label: "What it does", text: purpose },
  ].filter((b) => b.text?.trim());
  if (blocks.length === 0) return null;
  return (
    <div className="lib-explain" role="region" aria-label="About this item" tabIndex={0}>
      {blocks.map((b) => (
        <div key={b.key} className="lib-explain-block">
          <p className="eyebrow flex items-center gap-1.5">
            <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round">
              {ICONS[b.key]}
            </svg>
            {b.label}
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed">{b.text}</p>
        </div>
      ))}
    </div>
  );
}

/** Steps as one horizontal line: numbered nodes joined by a thin rule, text under each node. */
export function StepsLine({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <section aria-label="Steps">
      <p className="eyebrow mb-2">
        Steps <span className="text-muted-2">({steps.length})</span>
      </p>
      <ol className="lib-steps" tabIndex={0}>
        {steps.map((s, i) => (
          <li key={i} className="lib-step">
            <span className="lib-step-node">{i + 1}</span>
            <span className="mt-2 block text-[13px] leading-snug text-muted">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
