"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const Arrow = ({ left }: { left?: boolean }) => (
  <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={left ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} />
  </svg>
);

/** Steps as one horizontal line: numbered nodes joined by a thin rule, text under each node.
 * When it runs past the edge, a fade and a small arrow show there is more. */
export default function StepsLine({ steps, label = "Steps" }: { steps: string[]; label?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, steps]);

  function by(dir: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const step = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 160;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  }

  if (steps.length === 0) return null;
  return (
    <section aria-label={label}>
      <p className="eyebrow mb-2">
        {label} <span className="text-muted-2">({steps.length})</span>
      </p>
      <div className="lib-hscroll">
        <ol ref={ref} className="lib-steps" tabIndex={0} onScroll={measure} data-testid="lib-steps">
          {steps.map((s, i) => (
            <li key={i} className="lib-step">
              <span className="lib-step-node">{i + 1}</span>
              <span className="mt-2 block text-[13px] leading-snug text-muted">{s}</span>
            </li>
          ))}
        </ol>
        {edge.left && (
          <>
            <span aria-hidden className="lib-fade lib-fade-left" />
            <button type="button" className="lib-scroll-btn left-0" aria-label="Show earlier steps" onClick={() => by(-1)}>
              <span>
                <Arrow left />
              </span>
            </button>
          </>
        )}
        {edge.right && (
          <>
            <span aria-hidden className="lib-fade lib-fade-right" data-testid="lib-steps-fade" />
            <button type="button" className="lib-scroll-btn right-0" aria-label="Show more steps" onClick={() => by(1)}>
              <span>
                <Arrow />
              </span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
