"use client";

import { useState, type ReactNode } from "react";

/** Human / AI / Client tabs. The text for each tab is rendered on the server and passed in. */
export default function VariantTabs({ tabs }: { tabs: { label: string; body: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div role="tablist" aria-label="Versions" className="mb-3 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            role="tab"
            type="button"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`-mb-px border-b-2 px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] transition-colors ${
              i === active ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" hidden={i !== active}>
          {t.body}
        </div>
      ))}
    </div>
  );
}
