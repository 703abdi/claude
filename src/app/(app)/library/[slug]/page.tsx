import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Markdown, slugify } from "@/lib/markdown";
import { browseHref, buildTabs, kindLabel, parseSteps, parseVariants, subjectInfo } from "@/lib/library";
import { Breadcrumb, StepsStrip, type Crumb } from "@/components/library/parts";
import VariantTabs from "@/components/library/VariantTabs";

export const dynamic = "force-dynamic";

export default async function LibraryDocPage({ params }: PageProps<"/library/[slug]">) {
  const { slug } = await params;
  const [doc, all] = await Promise.all([
    prisma.libraryDoc.findUnique({ where: { slug } }),
    prisma.libraryDoc.findMany({ select: { slug: true, title: true } }),
  ]);
  if (!doc) notFound();

  const bySlug = new Map(all.map((d) => [d.slug, d.slug]));
  const byTitle = new Map(all.map((d) => [d.title.toLowerCase(), d.slug]));
  const resolve = (wiki: string) => {
    const t = wiki.trim();
    const s = byTitle.get(t.toLowerCase()) ?? bySlug.get(slugify(t));
    return s ? `/library/${s}` : null;
  };

  const subject = doc.subject ? subjectInfo(doc.subject) : null;
  const crumbs: Crumb[] = [{ label: "Library", href: "/library" }];
  if (subject) {
    crumbs.push({ label: subject.label, href: browseHref(subject.slug) });
    crumbs.push({ label: doc.source || "Other", href: browseHref(subject.slug, doc.source) });
    crumbs.push({ label: doc.topic || "Other", href: browseHref(subject.slug, doc.source, doc.topic) });
  }

  const explain = [
    { label: "What this is", text: doc.summary },
    { label: "Where it came from", text: doc.origin },
    { label: "What it does", text: doc.purpose },
  ].filter((e): e is { label: string; text: string } => !!e.text?.trim());
  const steps = parseSteps(doc.steps);
  const tabs = buildTabs(doc.content, parseVariants(doc.variants));
  const hasText = doc.content.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      {subject ? (
        <Breadcrumb crumbs={crumbs} />
      ) : (
        <Link href="/library" className="font-mono text-[12px] text-muted hover:text-accent">
          &larr; Library
        </Link>
      )}
      <div className="mt-4 mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="min-w-0 break-words text-[30px] leading-tight">{doc.title}</h1>
        <span className="font-mono text-[11px] text-muted-2">
          {doc.kind ? `${kindLabel(doc.kind)} · ` : ""}
          {doc.source || doc.folder} · {doc.addedBy === "manual" ? "added" : "edited"}{" "}
          {doc.mtime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>

      {(explain.length > 0 || doc.url) && (
        <section className="mb-6 space-y-4 border-l border-border-2 pl-4">
          {explain.map((e) => (
            <div key={e.label}>
              <p className="eyebrow eyebrow-accent">{e.label}</p>
              <p className="mt-1 text-[15px] leading-relaxed">{e.text}</p>
            </div>
          ))}
          {doc.url && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-block break-all font-mono text-[13px] text-accent hover:underline">
              Open link -&gt;
            </a>
          )}
        </section>
      )}

      {steps.length > 0 && (
        <div className="mb-6">
          <StepsStrip steps={steps} />
        </div>
      )}

      {tabs.length > 0 ? (
        <VariantTabs
          tabs={tabs.map((t) => ({
            label: t.label,
            body: (
              <div className="card p-5 md:p-7">
                <Markdown source={t.content} resolve={resolve} />
              </div>
            ),
          }))}
        />
      ) : hasText ? (
        <div className="card p-5 md:p-7">
          <Markdown source={doc.content} resolve={resolve} />
        </div>
      ) : (
        <p className="px-1 text-sm text-muted">No text saved, only the link.</p>
      )}
    </div>
  );
}
