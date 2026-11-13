"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type ReaderSection = { id: string; label: string; body: ReactNode };
export type ReaderVersion = { label: string; sections: ReaderSection[] };

/** The full note, one section at a time. Desktop: section list on the left, the picked section on
 * the right. Phone: a sideways row of chips above the section. A #section-id link opens that section.
 * Human / AI / Client versions get a small segmented control. */
export default function Reader({ versions }: { versions: ReaderVersion[] }) {
  const [v, setV] = useState(0);
  const [s, setS] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const version = versions[v] ?? versions[0];
  const sections = version.sections;
  const current = sections[Math.min(s, sections.length - 1)];

  useEffect(() => {
    // Open the section a #section-id link points at (in any version). Runs after paint, and again
    // whenever the hash changes.
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return false;
      for (let vi = 0; vi < versions.length; vi++) {
        const si = versions[vi].sections.findIndex((x) => x.id === id);
        if (si >= 0) {
          setV(vi);
          setS(si);
          return true;
        }
      }
      return false;
    };
    const raf = requestAnimationFrame(() => {
      if (open()) rootRef.current?.scrollIntoView({ block: "start" });
    });
    const onHash = () => open();
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", onHash);
    };
  }, [versions]);

  function pick(si: number) {
    setS(si);
    const sec = sections[si];
    if (sec) window.history.replaceState(null, "", `#${sec.id}`);
    paneRef.current?.scrollTo({ top: 0 });
    chipsRef.current?.querySelector<HTMLElement>(`[data-idx="${si}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
    if (window.innerWidth < 768) rootRef.current?.scrollIntoView({ block: "start" });
  }

  function pickVersion(vi: number) {
    setV(vi);
    setS(0);
    paneRef.current?.scrollTo({ top: 0 });
  }

  const single = sections.length < 2;
  const prev = !single && s > 0 ? sections[s - 1] : null;
  const next = !single && s < sections.length - 1 ? sections[s + 1] : null;

  return (
    <section ref={rootRef} aria-label="Full note" className="scroll-mt-4" data-testid="lib-reader">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow">Full note</h2>
        {versions.length > 1 && (
          <div role="group" aria-label="Version" className="lib-seg lib-seg-quiet">
            {versions.map((x, i) => (
              <button key={x.label} type="button" aria-pressed={i === v} onClick={() => pickVersion(i)}>
                {x.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {single ? (
        <div className="card p-5 md:p-7">{current?.body ?? <p className="text-sm text-muted">No text in this version.</p>}</div>
      ) : (
        <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
          {/* Phone: chips row */}
          <div ref={chipsRef} className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:hidden" role="tablist" aria-label="Sections">
            {sections.map((x, i) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                data-idx={i}
                aria-selected={i === s}
                aria-current={i === s}
                onClick={() => pick(i)}
                className="lib-chip shrink-0 whitespace-nowrap"
              >
                {x.label}
              </button>
            ))}
          </div>
          {/* Desktop: section list */}
          <nav aria-label="Sections" className="hidden md:block">
            <ol className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto border-l border-border">
              {sections.map((x, i) => (
                <li key={x.id} className="-ml-px">
                  <button type="button" aria-current={i === s} onClick={() => pick(i)} className="lib-toc-item" data-testid="lib-toc">
                    {x.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0">
            <div
              ref={paneRef}
              id={current?.id}
              role="region"
              aria-label={current?.label}
              tabIndex={-1}
              className="card max-h-[75vh] overflow-y-auto p-5 md:max-h-[calc(100vh-180px)] md:p-7"
              data-testid="lib-pane"
            >
              {current?.body}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              {prev ? (
                <button type="button" onClick={() => pick(s - 1)} className="lib-chip min-w-0">
                  <span aria-hidden>&lt;</span>
                  <span className="truncate">{prev.label}</span>
                </button>
              ) : (
                <span />
              )}
              <span className="shrink-0 font-mono text-[11px] text-muted-2">
                {s + 1} / {sections.length}
              </span>
              {next ? (
                <button type="button" onClick={() => pick(s + 1)} className="lib-chip min-w-0">
                  <span className="truncate">{next.label}</span>
                  <span aria-hidden>&gt;</span>
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
