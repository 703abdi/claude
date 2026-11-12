import Link from "next/link";
import { kindLabel, subjectInfo, type LibraryItem } from "@/lib/library";

export type Crumb = { label: string; href?: string };

/** Library / Content / Agency SOPs / Hooks and scripts. The last crumb is the current page. */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-2">
          {i > 0 && <span className="text-muted-2">/</span>}
          {c.href ? (
            <Link href={c.href} className="break-words hover:text-accent">
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

/** Flat bordered tiles in a grid. One level only: nothing boxed inside them. */
export function BoxGrid({ boxes }: { boxes: Box[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boxes.map((b) => (
        <li key={b.href} className="min-w-0">
          <Link
            href={b.href}
            className="tile flex h-full min-h-[96px] flex-col justify-between gap-3 p-4 transition-colors hover:border-border-2 hover:bg-surface-hover"
          >
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

/** Hairline list of items. With `showPath`, each row also shows subject / source / topic. */
export function ItemList({ items, title, showPath }: { items: LibraryItem[]; title?: string; showPath?: boolean }) {
  return (
    <section className="jarvis-panel">
      {title && <h2 className="mb-1 px-1 eyebrow">{title}</h2>}
      <ul>
        {items.map((d) => {
          const path = [d.subject ? (subjectInfo(d.subject)?.label ?? d.subject) : "Unsorted", d.source, d.topic].filter(Boolean).join(" / ");
          return (
            <li key={d.slug}>
              <Link href={`/library/${d.slug}`} className="jarvis-row items-start">
                <span className="min-w-0 flex-1 py-1">
                  <span className="block break-words text-[15px] font-medium">{d.title}</span>
                  {d.summary && <span className="mt-0.5 block truncate text-[13px] text-muted">{d.summary}</span>}
                  {showPath && <span className="mt-1 block truncate font-mono text-[11px] text-muted-2">{path}</span>}
                </span>
                <span className="shrink-0 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-2">{kindLabel(d.kind)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Numbered step tiles in a wrapping grid. Every row starts flush left with a tile. */
export function StepsStrip({ steps }: { steps: string[] }) {
  return (
    <section aria-label="Steps">
      <p className="eyebrow mb-2 px-1">Steps</p>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className="tile flex min-w-0 items-start gap-2 px-3 py-2">
            <span className="shrink-0 font-mono text-[12px] font-bold text-accent">{i + 1}</span>
            <span className="min-w-0 break-words text-[13px] leading-snug">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
