"use client";

import { useState, type ReactNode } from "react";

/** Full text behind tabs ("Full text", or Human / AI / Client). Collapsed by default so the summary
 * above stays the first screen; clicking the open tab again folds it away. The text for each tab is
 * rendered on the server and passed in. */
export default function VariantTabs({ tabs, defaultOpen = false }: { tabs: { label: string; body: ReactNode }[]; defaultOpen?: boolean }) {
  const [active, setActive] = useState<number | null>(defaultOpen ? 0 : null);
  return (
    <div>
      <div role="tablist" aria-label="Full text" className="flex flex-wrap items-end gap-1 border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            id={`lib-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls={`lib-panel-${i}`}
            onClick={() => setActive((a) => (a === i ? null : i))}
            className={`-mb-px min-h-11 border-b-2 px-3 font-mono text-[12px] font-bold uppercase tracking-[0.1em] transition-colors ${
              i === active ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === null && <p className="px-1 pt-3 text-[13px] text-muted-2">Pick a tab to read the full text.</p>}
      {tabs.map((t, i) => (
        <div key={t.label} id={`lib-panel-${i}`} role="tabpanel" aria-labelledby={`lib-tab-${i}`} hidden={i !== active} className="pt-4">
          {t.body}
        </div>
      ))}
    </div>
  );
}
