import { notFound } from "next/navigation";
import { browseHref, itemsIn, resolveSource, resolveTopic, subjectInfo } from "@/lib/library";
import { Breadcrumb, ItemList } from "@/components/library/parts";

export const dynamic = "force-dynamic";

export default async function LibraryTopicPage({ params }: PageProps<"/library/browse/[subject]/[source]/[topic]">) {
  const { subject, source: sourceSeg, topic: topicSeg } = await params;
  const info = subjectInfo(subject);
  if (!info) notFound();
  const source = await resolveSource(subject, sourceSeg);
  if (!source) notFound();
  const topic = await resolveTopic(subject, source.values, topicSeg);
  if (!topic) notFound();
  const items = await itemsIn(subject, source.values, topic.values);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <Breadcrumb
        crumbs={[
          { label: "Library", href: "/library" },
          { label: info.label, href: browseHref(subject) },
          { label: source.name, href: `${browseHref(subject)}/${sourceSeg}` },
          { label: topic.name },
        ]}
      />
      <div className="mt-4 mb-6">
        <h1 className="text-[30px] leading-tight">{topic.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {items.length} {items.length === 1 ? "item" : "items"} from {source.name}
        </p>
      </div>
      <ItemList items={items} />
    </div>
  );
}
