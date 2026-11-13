import { SUBJECTS, UNSORTED, kindFilters, searchLibrary, subjectCounts, toCard } from "@/lib/library";
import { BoxGrid, type Box } from "@/components/library/parts";
import ItemBrowser from "@/components/library/ItemBrowser";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <h1 className="text-[34px]">Library</h1>
        <p className="mt-1 text-sm text-muted">Everything in the vault worth learning from. Read here, edit in Obsidian.</p>
      </div>

      <form action="/library" method="get" role="search" className="mb-8">
        <label htmlFor="library-q" className="eyebrow mb-1.5 block px-1">
          What are you looking for?
        </label>
        <div className="flex gap-2">
          <input
            id="library-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Hooks, cold DMs, Meta ads..."
            className="type-box h-11 min-w-0 flex-1 bg-surface-2 px-3 text-[15px] outline-none placeholder:text-muted-2"
          />
          <button type="submit" className="h-11 shrink-0 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background">
            Search
          </button>
        </div>
      </form>

      {q ? <Results q={q} /> : <Subjects />}
    </div>
  );
}

async function Results({ q }: { q: string }) {
  const items = await searchLibrary(q);
  if (items.length === 0) return <p className="px-1 text-sm text-muted">Nothing matches &quot;{q}&quot;.</p>;
  return (
    <section>
      <h2 className="eyebrow mb-3 px-1">
        {items.length} {items.length === 1 ? "match" : "matches"} for &quot;{q}&quot;
      </h2>
      <ItemBrowser items={items.map(toCard)} filters={kindFilters(items)} showPath />
    </section>
  );
}

async function Subjects() {
  const counts = await subjectCounts();
  const boxes: Box[] = SUBJECTS.map((s) => ({ href: `/library/browse/${s.slug}`, label: s.label, blurb: s.blurb, count: counts[s.slug] }));
  if (counts[UNSORTED.slug] > 0) {
    boxes.push({ href: `/library/browse/${UNSORTED.slug}`, label: UNSORTED.label, blurb: UNSORTED.blurb, count: counts[UNSORTED.slug] });
  }
  boxes.push({ href: "/library/new", label: "Add new", blurb: "Paste a note or a link and file it under a subject.", accent: true });
  return <BoxGrid boxes={boxes} />;
}
