import { isDoDont, type Visual as V } from "@/lib/library-view";

/** The drawn graphic for a Library item (all but "flow", which is the steps line). App tokens only;
 * the accent marks one thing: the result of a formula or the last funnel stage. */
export default function Visual({ visual }: { visual: Exclude<V, { type: "flow" }> }) {
  switch (visual.type) {
    case "formula":
      return (
        <div className="flex flex-wrap items-center gap-2" role="img" aria-label={`${visual.parts.join(" plus ")} equals ${visual.result}`} data-visual="formula">
          {visual.parts.map((p, i) => (
            <span key={i} className="contents">
              {i > 0 && <span className="lib-op">+</span>}
              <span className="lib-ftile">{p}</span>
            </span>
          ))}
          <span className="lib-op">=</span>
          <span className="lib-ftile lib-ftile-result">{visual.result}</span>
        </div>
      );
    case "twocol": {
      const marks = isDoDont(visual.leftLabel, visual.rightLabel);
      const col = (label: string, items: string[], side: "left" | "right") => (
        <div className={side === "right" ? "border-l border-border pl-4" : ""}>
          {label && <p className="eyebrow mb-2">{label}</p>}
          <ul className="space-y-2">
            {items.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
                <span aria-hidden className="mt-0.5 shrink-0">
                  {marks ? (
                    side === "left" ? (
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5 6.5 12 13 4.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--muted-2)" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    )
                  ) : (
                    <svg viewBox="0 0 16 16" width="14" height="14">
                      <circle cx="8" cy="8" r="2.2" fill="var(--muted-2)" />
                    </svg>
                  )}
                </span>
                <span className={side === "right" && marks ? "text-muted" : ""}>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      );
      return (
        <div className="grid grid-cols-2 gap-4" data-visual="twocol">
          {col(visual.leftLabel, visual.left, "left")}
          {col(visual.rightLabel, visual.right, "right")}
        </div>
      );
    }
    case "funnel": {
      const n = visual.stages.length;
      return (
        <ol className="flex flex-col gap-1.5" aria-label="Stages, top to bottom" data-visual="funnel">
          {visual.stages.map((s, i) => (
            <li key={i} className="lib-funnel-bar" style={{ width: `${100 - (n > 1 ? (i * 50) / (n - 1) : 0)}%` }}>
              {s}
            </li>
          ))}
        </ol>
      );
    }
    case "numbers":
      return (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${visual.items.length}, minmax(0, 1fr))` }} data-visual="numbers">
          {visual.items.map((it, i) => (
            <div key={i} className="lib-explain-block min-w-0">
              <p className="break-words text-[28px] font-bold leading-none tracking-[-0.02em] md:text-[32px]">{it.value}</p>
              <p className="mt-1.5 text-[12px] leading-snug text-muted">{it.label}</p>
            </div>
          ))}
        </div>
      );
  }
}
