import { notFound } from "next/navigation";
import { browseHref, resolveSource, subjectInfo, topicsIn } from "@/lib/library";
import { BoxGrid, Breadcrumb } from "@/components/library/parts";

export const dynamic = "force-dynamic";

export default async function LibrarySourcePage({ params }: PageProps<"/library/browse/[subject]/[source]">) {
  const { subject, source: seg } = await params;
  const info = subjectInfo(subject);
  if (!info) notFound();
  const source = await resolveSource(subject, seg);
  if (!source) notFound();
  const topics = await topicsIn(subject, source.values);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <Breadcrumb crumbs={[{ label: "Library", href: "/library" }, { label: info.label, href: browseHref(subject) }, { label: source.name }]} />
      <div className="mt-4 mb-6">
        <h1 className="text-[30px] leading-tight">{source.name}</h1>
        <p className="mt-1 text-sm text-muted">Topics in {info.label}</p>
      </div>
      <BoxGrid boxes={topics.map((t) => ({ href: `${browseHref(subject)}/${seg}/${t.seg}`, label: t.name, count: t.count }))} />
    </div>
  );
}
