import Link from "next/link";
import type { CardItem } from "@/lib/library";
import { domainOf } from "@/lib/library-view";
import StepsLine from "./StepsLine";
import Visual from "./Visual";

/** The short version of an item, shared by the pop-up and the top of the item page:
 * one-line tldr, "Use it", the drawn visual (or the steps line), an example, link chips, a from line,
 * and the old long paragraphs behind "More detail". Items without the v2 fields fall back to the
 * summary as the tldr and their steps as the line. */
export default function ItemSummary({ item }: { item: CardItem }) {
  const tldr = item.tldr ?? item.summary;
  const visual = item.visual ?? (item.steps.length ? { type: "flow" as const } : null);
  const external = [...(item.url ? [{ label: "Open link", url: item.url }] : []), ...item.links.filter((l) => l.url !== item.url)];
  const more = [
    { label: "What this is", text: item.tldr ? item.summary : null },
    { label: "Where it came from", text: item.origin },
    { label: "What it does", text: item.purpose },
  ].filter((m): m is { label: string; text: string } => !!m.text?.trim());

  return (
    <div className="flex flex-col gap-5" data-testid="lib-summary">
      {(tldr || item.useWhen) && (
        <div>
          {tldr && <p className="text-[17px] font-medium leading-snug md:text-[19px]">{tldr}</p>}
          {item.useWhen && <p className="mt-1.5 text-[13px] text-muted">Use it: {item.useWhen}</p>}
        </div>
      )}

      {visual?.type === "flow" ? (
        <StepsLine steps={item.steps} />
      ) : visual ? (
        <div className={`grid grid-cols-1 gap-5 ${item.steps.length ? "md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] md:gap-8" : ""}`}>
          <div className="min-w-0 self-center">
            <Visual visual={visual} />
          </div>
          {item.steps.length > 0 && (
            <section aria-label="Do this" className="min-w-0">
              <p className="eyebrow mb-2">Do this</p>
              <ol className="space-y-1.5">
                {item.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug">
                    <span className="lib-step-node shrink-0" style={{ width: 22, height: 22, fontSize: 11 }}>
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      ) : null}

      {item.example && (
        <figure className="border-l-2 border-border-2 pl-3">
          <figcaption className="eyebrow mb-1">{item.example.label ?? "Example"}</figcaption>
          <blockquote className="text-[14px] leading-relaxed">&quot;{item.example.text}&quot;</blockquote>
        </figure>
      )}

      {(external.length > 0 || item.related.length > 0) && (
        <ul className="flex flex-wrap gap-2" aria-label="Links">
          {external.map((l) => (
            <li key={l.url} className="min-w-0 max-w-full">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="lib-chip">
                <span className="truncate">{l.label}</span>
                <span className="truncate font-mono text-[11px] font-normal text-muted-2">{domainOf(l.url)}</span>
              </a>
            </li>
          ))}
          {item.related.map((r) => (
            <li key={r.slug} className="min-w-0 max-w-full">
              <Link href={`/library/${r.slug}`} className="lib-chip">
                <svg aria-hidden viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="var(--muted-2)" strokeWidth="1.4" strokeLinejoin="round">
                  <rect x="3.5" y="2" width="9" height="12" rx="1.5" />
                  <path d="M6 5.5h4M6 8h4" />
                </svg>
                <span className="truncate">{r.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {item.fromLine && <p className="text-[12px] text-muted-2">From: {item.fromLine}</p>}

      {more.length > 0 && (
        <details className="lib-more">
          <summary className="font-mono text-[12px] text-muted hover:text-foreground">
            <span aria-hidden className="lib-more-caret inline-block transition-transform">
              &gt;
            </span>
            More detail
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {more.map((m) => (
              <div key={m.label}>
                <p className="eyebrow">{m.label}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{m.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
