import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Markdown, slugify } from "@/lib/markdown";
import { browseHref, buildTabs, kindLabel, parseSteps, parseVariants, subjectInfo } from "@/lib/library";
import { Breadcrumb, ExplainRow, KindTag, StepsLine, type Crumb } from "@/components/library/parts";
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

  const steps = parseSteps(doc.steps);
  const hasSummary = !!(doc.summary?.trim() || doc.origin?.trim() || doc.purpose?.trim()) || steps.length > 0;
  const variantTabs = buildTabs(doc.content, parseVariants(doc.variants));
  const tabs = variantTabs.length > 0 ? variantTabs : doc.content.trim() ? [{ label: "Full text", content: doc.content }] : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      {subject ? (
        <Breadcrumb crumbs={crumbs} />
      ) : (
        <Link href="/library" className="font-mono text-[12px] text-muted hover:text-foreground">
          &larr; Library
        </Link>
      )}

      <div className="mt-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {doc.kind && <KindTag label={kindLabel(doc.kind)} />}
          <span className="font-mono text-[11px] text-muted-2">
            {doc.source || doc.folder} · {doc.addedBy === "manual" ? "added" : "edited"}{" "}
            {doc.mtime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
        <h1 className="mt-2 min-w-0 break-words text-[28px] leading-tight md:text-[32px]">{doc.title}</h1>
      </div>

      <div className="flex flex-col gap-6" id="summary">
        <ExplainRow summary={doc.summary} origin={doc.origin} purpose={doc.purpose} />
        <StepsLine steps={steps} />
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center self-start rounded-lg bg-accent px-5 text-[14px] font-semibold text-accent-ink hover:bg-accent-hover"
          >
            Open link
          </a>
        )}
      </div>

      <div className="mt-8">
        {tabs.length > 0 ? (
          <VariantTabs
            defaultOpen={!hasSummary}
            tabs={tabs.map((t) => ({
              label: t.label,
              body: (
                <div className="card max-w-3xl p-5 md:p-7">
                  <Markdown source={t.content} resolve={resolve} />
                </div>
              ),
            }))}
          />
        ) : (
          <p className="px-1 text-sm text-muted">No text saved, only the link.</p>
        )}
      </div>
    </div>
  );
}
