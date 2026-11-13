import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Markdown, slugify } from "@/lib/markdown";
import { browseHref, buildTabs, parseVariants, subjectInfo, toCard } from "@/lib/library";
import { splitSections } from "@/lib/note-sections";
import { Breadcrumb, KindTag, type Crumb } from "@/components/library/parts";
import ItemSummary from "@/components/library/ItemSummary";
import Reader, { type ReaderVersion } from "@/components/library/Reader";

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

  const item = toCard(doc);
  const hasSummary = !!(item.tldr || item.summary || item.visual || item.steps.length || item.example || item.links.length || item.related.length);

  // The full note: one version, or Human / AI / Client, each split into sections.
  const variantTabs = buildTabs(doc.content, parseVariants(doc.variants));
  const texts = variantTabs.length > 0 ? variantTabs : doc.content.trim() ? [{ label: "Full text", content: doc.content }] : [];
  const versions: ReaderVersion[] = texts.map((t) => ({
    label: t.label,
    sections: splitSections(t.content).map((sec) => ({ id: sec.id, label: sec.label, body: <Markdown source={sec.body} resolve={resolve} /> })),
  }));
  const plain = versions.length === 1 && versions[0].sections.length < 2;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      {subject ? (
        <Breadcrumb crumbs={crumbs} />
      ) : (
        <Link href="/library" className="font-mono text-[12px] text-muted hover:text-foreground">
          &larr; Library
        </Link>
      )}

      <div className="mt-4 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <KindTag label={item.kindLabel} />
          <span className="font-mono text-[11px] text-muted-2">
            {doc.source || doc.folder} · {doc.addedBy === "manual" ? "added" : "edited"}{" "}
            {doc.mtime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
        <h1 className="mt-2 min-w-0 break-words text-[28px] leading-tight md:text-[32px]">{doc.title}</h1>
      </div>

      {hasSummary && (
        <div id="lib-top" className="mb-10">
          <ItemSummary item={item} />
        </div>
      )}

      {texts.length === 0 ? (
        <p className="px-1 text-sm text-muted">No text saved, only the link.</p>
      ) : plain ? (
        <section aria-label="Full note">
          <h2 className="eyebrow mb-3">Full note</h2>
          <div className="card max-w-3xl p-5 md:p-7">
            <Markdown source={texts[0].content} resolve={resolve} />
          </div>
        </section>
      ) : (
        <Reader versions={versions} />
      )}
    </div>
  );
}
