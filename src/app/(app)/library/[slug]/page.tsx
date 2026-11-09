import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Markdown, slugify } from "@/lib/markdown";

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link href="/library" className="font-mono text-[12px] text-muted hover:text-accent">
        &larr; Library
      </Link>
      <div className="mt-4 mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[30px] leading-tight">{doc.title}</h1>
        <span className="font-mono text-[11px] text-muted-2">
          {doc.folder} · edited {doc.mtime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>
      <div className="card p-5 md:p-7">
        <Markdown source={doc.content} resolve={resolve} />
      </div>
    </div>
  );
}
