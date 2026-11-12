import { notFound } from "next/navigation";
import { browseHref, sourcesIn, subjectInfo } from "@/lib/library";
import { BoxGrid, Breadcrumb } from "@/components/library/parts";

export const dynamic = "force-dynamic";

export default async function LibrarySubjectPage({ params }: PageProps<"/library/browse/[subject]">) {
  const { subject } = await params;
  const info = subjectInfo(subject);
  if (!info) notFound();
  const sources = await sourcesIn(subject);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <Breadcrumb crumbs={[{ label: "Library", href: "/library" }, { label: info.label }]} />
      <div className="mt-4 mb-6">
        <h1 className="text-[30px] leading-tight">{info.label}</h1>
        <p className="mt-1 text-sm text-muted">{info.blurb}</p>
      </div>
      {sources.length === 0 ? (
        <p className="px-1 text-sm text-muted">Nothing here yet.</p>
      ) : (
        <BoxGrid boxes={sources.map((s) => ({ href: `${browseHref(subject)}/${s.seg}`, label: s.name, count: s.count }))} />
      )}
    </div>
  );
}
