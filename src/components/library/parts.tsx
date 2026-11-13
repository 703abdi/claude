import Link from "next/link";

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
