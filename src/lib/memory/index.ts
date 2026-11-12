import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { chunkText, cleanSnippet, hashDoc, isSearchable, normaliseText, orQuery, queryWords } from "./text";

/** Searchable memory: vault files, chats, Fathom calls, People notes and Notes, all in MemoryDoc.
 * Each document is split into chunks of about 3,500 characters. Postgres keeps a generated
 * tsvector ("tsv") per chunk, so search is plain full-text search with a GIN index. */

export type MemoryHit = {
  id: string;
  source: string; // "vault" | "fathom" | "note" | "person"
  title: string;
  /** About 300 characters around the match, plain text. */
  snippet: string;
  url: string | null;
  date: string | null; // ISO
  score: number;
};

export type MemoryInput = { source: string; externalId: string; title: string; body: string; url?: string | null; date?: Date | null };

const MAX_PER_DOC = 2;
const MAX_QUERY = 500;

type Row = {
  id: string;
  source: string;
  title: string;
  url: string | null;
  date: Date | null;
  score: number;
  headline: string;
};

async function runSearch(query: string, limit: number, sources: string[] | undefined): Promise<Row[]> {
  const sourceFilter = sources?.length ? Prisma.sql`AND d."source" = ANY(${sources})` : Prisma.empty;
  // Rank: ts_rank_cd, times a mild boost for recent documents (up to 1.5x, half of that at 30 days).
  // Then keep the best 2 chunks per document, take the top `limit`, and only then build snippets.
  return prisma.$queryRaw<Row[]>`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS tsq),
    matched AS (
      SELECT d."id", d."source", d."externalId", d."title", d."body", d."url", d."date",
        ts_rank_cd(d."tsv", q.tsq)::float8
          * (1 + 0.5 / (1 + EXTRACT(EPOCH FROM (now() - COALESCE(d."date", d."updatedAt"))) / 2592000.0)) AS score
      FROM "MemoryDoc" d, q
      WHERE numnode(q.tsq) > 0 AND d."tsv" @@ q.tsq ${sourceFilter}
    ),
    capped AS (
      SELECT *, row_number() OVER (PARTITION BY "source", "externalId" ORDER BY score DESC) AS rn FROM matched
    ),
    top AS (
      SELECT * FROM capped WHERE rn <= ${MAX_PER_DOC} ORDER BY score DESC LIMIT ${limit}
    )
    SELECT top."id", top."source", top."title", top."url", top."date", top.score::float8 AS score,
      ts_headline('english', top."body", q.tsq,
        'StartSel="", StopSel="", MaxWords=45, MinWords=20, MaxFragments=2, FragmentDelimiter=" ... "') AS headline
    FROM top, q
    ORDER BY top.score DESC`;
}

/** Full-text search over everything in memory, best match first. */
export async function searchMemory(query: string, opts: { limit?: number; sources?: string[] } = {}): Promise<MemoryHit[]> {
  const q = (query ?? "").slice(0, MAX_QUERY).trim();
  if (!q || !isSearchable(q)) return [];
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 6), 1), 50);

  let rows = await runSearch(q, limit, opts.sources);
  // Nothing for the strict (all words) query: retry with any of the words.
  if (rows.length === 0 && queryWords(q).length > 1) rows = await runSearch(orQuery(q), limit, opts.sources);

  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    title: r.title,
    snippet: cleanSnippet(r.headline ?? ""),
    url: r.url,
    date: r.date ? new Date(r.date).toISOString() : null,
    score: Number(r.score),
  }));
}

/** Store or refresh one document (split into chunks). No-op when the content hash is unchanged. */
export async function upsertMemory(doc: MemoryInput): Promise<{ chunks: number; changed: boolean }> {
  const title = normaliseText(doc.title).replace(/\s+/g, " ").slice(0, 500) || "Untitled";
  const body = normaliseText(doc.body ?? "");
  const hash = hashDoc(title, body);
  const key = { source: doc.source, externalId: doc.externalId };

  const first = await prisma.memoryDoc.findUnique({
    where: { source_externalId_chunk: { ...key, chunk: 0 } },
    select: { hash: true },
  });
  if (first?.hash === hash) {
    return { chunks: await prisma.memoryDoc.count({ where: key }), changed: false };
  }

  const parts = chunkText(body);
  const now = new Date();
  await prisma.$transaction([
    prisma.memoryDoc.deleteMany({ where: key }),
    prisma.memoryDoc.createMany({
      data: parts.map((part, chunk) => ({
        ...key,
        chunk,
        title,
        body: part,
        url: doc.url ?? null,
        date: doc.date ?? null,
        hash,
        updatedAt: now,
      })),
    }),
  ]);
  return { chunks: parts.length, changed: true };
}

export async function deleteMemory(source: string, externalId: string): Promise<void> {
  await prisma.memoryDoc.deleteMany({ where: { source, externalId } });
}

export type MemorySourceStats = { source: string; docs: number; chunks: number; bytes: number; lastUpdated: string | null };

/** Counts and total body bytes per source. */
export async function memoryStats(): Promise<{ sources: MemorySourceStats[]; total: { docs: number; chunks: number; bytes: number } }> {
  const rows = await prisma.$queryRaw<{ source: string; docs: bigint; chunks: bigint; bytes: bigint | null; last: Date | null }[]>`
    SELECT "source", COUNT(DISTINCT "externalId") AS docs, COUNT(*) AS chunks,
      SUM(octet_length("body")) AS bytes, MAX("updatedAt") AS last
    FROM "MemoryDoc" GROUP BY "source" ORDER BY "source"`;
  const sources = rows.map((r) => ({
    source: r.source,
    docs: Number(r.docs),
    chunks: Number(r.chunks),
    bytes: Number(r.bytes ?? 0),
    lastUpdated: r.last ? new Date(r.last).toISOString() : null,
  }));
  const total = sources.reduce((t, s) => ({ docs: t.docs + s.docs, chunks: t.chunks + s.chunks, bytes: t.bytes + s.bytes }), { docs: 0, chunks: 0, bytes: 0 });
  return { sources, total };
}

/** A person's notes in memory. Empty notes take the person out of memory. */
export async function indexPerson(p: { id: string; name: string; notes: string | null }): Promise<{ changed: boolean; removed: boolean }> {
  if (!p.notes?.trim()) {
    await deleteMemory("person", p.id);
    return { changed: false, removed: true };
  }
  const r = await upsertMemory({ source: "person", externalId: p.id, title: p.name, body: p.notes, url: `/people/${p.id}`, date: null });
  return { changed: r.changed, removed: false };
}

/** A Note row in memory. */
export async function indexNote(n: { id: string; title: string; body: string; updatedAt: Date }): Promise<{ changed: boolean }> {
  const r = await upsertMemory({ source: "note", externalId: n.id, title: n.title.trim() || "Untitled note", body: n.body, url: `/notes?id=${n.id}`, date: n.updatedAt });
  return { changed: r.changed };
}

/** Index every Person with notes and every Note, and drop memory rows whose person or note is gone. */
export async function reindexPeopleAndNotes() {
  const people = await prisma.person.findMany({ select: { id: true, name: true, notes: true } });
  let peopleIndexed = 0;
  let peopleChanged = 0;
  for (const p of people) {
    const r = await indexPerson(p);
    if (!r.removed) peopleIndexed++;
    if (r.changed) peopleChanged++;
  }

  const notes = await prisma.note.findMany({ select: { id: true, title: true, body: true, updatedAt: true } });
  let notesChanged = 0;
  for (const n of notes) {
    if ((await indexNote(n)).changed) notesChanged++;
  }

  const stalePeople = await prisma.memoryDoc.deleteMany({ where: { source: "person", externalId: { notIn: people.map((p) => p.id) } } });
  const staleNotes = await prisma.memoryDoc.deleteMany({ where: { source: "note", externalId: { notIn: notes.map((n) => n.id) } } });

  return {
    people: { indexed: peopleIndexed, changed: peopleChanged },
    notes: { indexed: notes.length, changed: notesChanged },
    removedChunks: stalePeople.count + staleNotes.count,
  };
}
