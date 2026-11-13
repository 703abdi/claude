"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CardItem, KindFilter } from "@/lib/library";
import { groupItems } from "@/lib/library-view";
import ItemSummary from "./ItemSummary";
import { KindTag, TILE } from "./parts";

/** Card grid with a kind filter and a pop-up for each item. Cards link to /library/[slug], so
 * middle-click and no-JS still work; a plain click opens the pop-up instead. With `grouped`, items
 * that have a group label show under small headings, and previous / next follow that order. */
export default function ItemBrowser({
  items,
  filters,
  showPath,
  grouped,
}: {
  items: CardItem[];
  filters: KindFilter[];
  showPath?: boolean;
  grouped?: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const filtered = filter === "all" ? items : items.filter((it) => (it.kind ?? "doc") === filter);
  const groups = grouped ? groupItems(filtered) : [{ label: null, items: filtered }];
  const shown = groups.flatMap((g) => g.items);
  const current = open !== null ? shown[open] : null;

  const close = () => dialogRef.current?.close();
  const move = (d: number) => setOpen((i) => (i === null ? i : Math.min(Math.max(i + d, 0), shown.length - 1)));

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg || open === null) return;
    if (!dlg.open) {
      dlg.showModal();
      document.documentElement.classList.add("lib-noscroll");
    }
    bodyRef.current?.scrollTo({ top: 0 });
  }, [open]);

  function onClosed() {
    document.documentElement.classList.remove("lib-noscroll");
    setOpen(null);
    openerRef.current?.focus();
  }

  function onCardClick(e: React.MouseEvent<HTMLAnchorElement>, i: number) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openerRef.current = e.currentTarget;
    setOpen(i);
  }

  function onDialogKey(e: React.KeyboardEvent) {
    // Arrow keys inside the sideways steps line scroll it instead.
    if ((e.target as HTMLElement).closest?.('[data-testid="lib-steps"]')) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(-1);
    }
  }

  return (
    <div>
      {filters.length > 1 && (
        <div role="group" aria-label="Filter by kind" className="lib-seg mb-5">
          {filters.map((f) => (
            <button key={f.kind} type="button" aria-pressed={filter === f.kind} onClick={() => setFilter(f.kind)}>
              {f.label} <span className="font-mono text-[11px] opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-8">
        {groups.map((g, gi) => {
          const offset = groups.slice(0, gi).reduce((n, x) => n + x.items.length, 0);
          return (
            <section key={g.label ?? "all"} aria-label={g.label ?? undefined}>
              {g.label && (
                <h2 className="eyebrow mb-3 px-1">
                  {g.label} <span className="text-muted-2">{g.items.length}</span>
                </h2>
              )}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="lib-cards">
                {g.items.map((it, j) => (
                  <li key={it.slug} className="min-w-0">
                    <Link
                      href={`/library/${it.slug}`}
                      onClick={(e) => onCardClick(e, offset + j)}
                      className={`${TILE} flex h-full min-h-[44px] flex-col gap-2 p-4`}
                    >
                      <KindTag label={it.kindLabel} />
                      <span className="line-clamp-2 break-words text-[15px] font-semibold leading-snug">{it.title}</span>
                      {(it.tldr ?? it.summary) && <span className="line-clamp-2 text-[13px] leading-snug text-muted">{it.tldr ?? it.summary}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <dialog
        ref={dialogRef}
        className="lib-dialog"
        aria-labelledby="lib-dialog-title"
        onClose={onClosed}
        onKeyDown={onDialogKey}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {current && (
          <>
            <div className="flex items-start gap-3 border-b border-border px-5 pb-3 pt-4 md:px-7">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <KindTag label={current.kindLabel} />
                  {showPath && <span className="truncate font-mono text-[11px] text-muted-2">{current.path}</span>}
                </div>
                <h2 id="lib-dialog-title" className="mt-1.5 break-words text-[20px] font-semibold leading-tight md:text-[24px]">
                  {current.title}
                </h2>
              </div>
              <button type="button" onClick={close} autoFocus aria-label="Close" className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground">
                <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
                </svg>
              </button>
            </div>

            <div ref={bodyRef} className="lib-dialog-body px-5 py-5 md:px-7">
              <ItemSummary key={current.slug} item={current} />
              {!current.tldr && !current.summary && current.steps.length === 0 && !current.visual && (
                <p className="text-[14px] text-muted">No summary yet. Open the full note to read it.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3 md:px-7">
              <Link href={`/library/${current.slug}`} className="inline-flex h-11 items-center rounded-lg bg-accent px-5 text-[14px] font-semibold text-accent-ink hover:bg-accent-hover">
                Read the full note
              </Link>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => move(-1)} aria-disabled={open === 0} aria-label="Previous item" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground aria-disabled:opacity-30">
                  <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 3.5 5.5 8l4.5 4.5" />
                  </svg>
                </button>
                <span className="min-w-[64px] text-center font-mono text-[12px] text-muted" aria-live="polite">
                  {(open ?? 0) + 1} of {shown.length}
                </span>
                <button type="button" onClick={() => move(1)} aria-disabled={open === shown.length - 1} aria-label="Next item" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground aria-disabled:opacity-30">
                  <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3.5 10.5 8 6 12.5" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
