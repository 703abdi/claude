import { DEFAULT_MANUAL_SOURCE, SUBJECTS, knownSourcesAndTopics } from "@/lib/library";
import { Breadcrumb } from "@/components/library/parts";
import NewDocForm from "@/components/library/NewDocForm";

export const dynamic = "force-dynamic";

export default async function LibraryNewPage() {
  const { sources, topics } = await knownSourcesAndTopics();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <Breadcrumb crumbs={[{ label: "Library", href: "/library" }, { label: "Add new" }]} />
      <div className="mt-4 mb-6">
        <h1 className="text-[30px] leading-tight">Add new</h1>
        <p className="mt-1 text-sm text-muted">Paste a note or a link and pick where it goes. The vault sync never removes it.</p>
      </div>
      <NewDocForm
        subjects={SUBJECTS.map((s) => ({ slug: s.slug, label: s.label }))}
        sources={[...new Set([DEFAULT_MANUAL_SOURCE, ...sources])]}
        topics={topics}
        defaultSource={DEFAULT_MANUAL_SOURCE}
      />
    </div>
  );
}
