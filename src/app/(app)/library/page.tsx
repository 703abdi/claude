import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function ago(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function LibraryPage() {
  const docs = await prisma.libraryDoc.findMany({
    orderBy: [{ folder: "asc" }, { order: "asc" }, { title: "asc" }],
    select: { slug: true, title: true, folder: true, mtime: true },
  });
  const folders = [...new Set(docs.map((d) => d.folder))];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-[34px]">Library</h1>
        <p className="mt-1 text-sm text-muted">Your rules and notes from Obsidian. Read here, edit in Obsidian.</p>
      </div>

      {docs.length === 0 ? (
        <div className="card p-6">
          <p className="text-sm text-muted">Nothing here yet. Run the sync from your Mac:</p>
          <pre className="md-pre mt-3">scripts/sync-library.sh</pre>
        </div>
      ) : (
        folders.map((folder) => (
          <section key={folder} className="mb-8">
            <p className="eyebrow eyebrow-accent mb-3 px-1">{folder}</p>
            <ul className="card divide-y divide-border overflow-hidden">
              {docs
                .filter((d) => d.folder === folder)
                .map((d) => (
                  <li key={d.slug}>
                    <Link href={`/library/${d.slug}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-hover">
                      <span className="text-[15px] font-semibold">{d.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-2">{ago(d.mtime)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
