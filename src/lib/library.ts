import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseExample, parseLinks, parseRelated, parseVisual, type Example, type ItemLink, type Related, type Visual } from "@/lib/library-view";

/** Library drill-down: subject -> source -> topic -> items. Subjects are fixed; sources and topics are
 * free text, so their URL segments are slugs that get mapped back to the stored values by query. */

export const SUBJECTS = [
  { slug: "content", label: "Content", blurb: "Hooks, scripts, posting and growing an audience." },
  { slug: "paid-ads", label: "Paid Ads", blurb: "Running, testing and reading ads." },
  { slug: "sales", label: "Sales and Outreach", blurb: "Finding leads, DMs, calls and closing." },
  { slug: "websites-design", label: "Websites and Design", blurb: "Sites, landing pages and how things look." },
  { slug: "claude-ai", label: "Claude and AI", blurb: "Working with Claude, agents and AI tools." },
  { slug: "agency-ops", label: "Agency Ops", blurb: "Clients, delivery, hiring and how the agency runs." },
  { slug: "business", label: "Business and Offers", blurb: "Offers, pricing, money and the bigger plan." },
] as const;

export type SubjectSlug = (typeof SUBJECTS)[number]["slug"];
export const SUBJECT_SLUGS: string[] = SUBJECTS.map((s) => s.slug);
export const UNSORTED = { slug: "unsorted", label: "Unsorted", blurb: "Docs that have no subject yet." } as const;
/** Label for docs in a subject (or source) that have no source (or topic). */
export const OTHER = "Other";
export const DEFAULT_MANUAL_SOURCE = "Added by you";

export const KINDS = ["sop", "research", "method", "report", "chat", "note", "link"] as const;
const KIND_LABELS: Record<string, string> = {
  sop: "SOP",
  research: "Research",
  method: "Method",
  report: "Report",
  chat: "Chat",
  note: "Note",
  link: "Link",
};

export function isSubject(slug: string): slug is SubjectSlug {
  return SUBJECT_SLUGS.includes(slug);
}

/** The subject (or the Unsorted bucket) for a URL segment, or null if it is neither. */
export function subjectInfo(slug: string): { slug: string; label: string; blurb: string } | null {
  if (slug === UNSORTED.slug) return UNSORTED;
  return SUBJECTS.find((s) => s.slug === slug) ?? null;
}

export function kindLabel(kind: string | null | undefined): string {
  if (!kind) return "Doc";
  return KIND_LABELS[kind] ?? kind;
}

/** Same rule as slugify in src/lib/markdown.tsx (kept here so this file has no React import). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** URL segment for a source or topic. Null (no source/topic) becomes "other". */
export function segmentOf(value: string | null | undefined): string {
  if (!value || !value.trim()) return slugify(OTHER);
  return slugify(value) || slugify(OTHER);
}

/** Every stored value (null included) whose segment equals `seg`. Empty means no match. */
export function valuesForSegment(values: (string | null)[], seg: string): (string | null)[] {
  return [...new Set(values)].filter((v) => segmentOf(v) === seg);
}

/** Display name for a group of values that share a segment. */
export function displayName(values: (string | null)[]): string {
  return values.find((v): v is string => !!v && !!v.trim()) ?? OTHER;
}

/** A slug based on `base` that is not in `taken`: base, base-2, base-3 ... */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = slugify(base) || "item";
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const s = `${root}-${i}`;
    if (!taken.has(s)) return s;
  }
}

export type Variant = { label: string; content: string; sourcePath?: string };

export function parseSteps(json: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

export function parseVariants(json: Prisma.JsonValue | null | undefined): Variant[] {
  if (!Array.isArray(json)) return [];
  const out: Variant[] = [];
  for (const v of json) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const label = (v as Record<string, unknown>).label;
    const content = (v as Record<string, unknown>).content;
    const sourcePath = (v as Record<string, unknown>).sourcePath;
    if (typeof label !== "string" || typeof content !== "string") continue;
    out.push({ label, content, ...(typeof sourcePath === "string" ? { sourcePath } : {}) });
  }
  return out;
}

/** Tabs for an item page: the primary text is "Human" unless a variant already uses that label. */
export function buildTabs(primary: string, variants: Variant[]): Variant[] {
  if (variants.length === 0) return [];
  const hasHuman = variants.some((v) => v.label.toLowerCase() === "human");
  const tabs = hasHuman ? [...variants] : [{ label: "Human", content: primary }, ...variants];
  const rank = (l: string) => {
    const i = ["human", "ai", "client"].indexOf(l.toLowerCase());
    return i === -1 ? 9 : i;
  };
  return tabs.sort((a, b) => rank(a.label) - rank(b.label));
}

export type Group = { name: string; seg: string; count: number };

/** Groups rows by the segment of a field, so values that slug the same land together. Sorted by name, Other last. */
export function groupBySegment(rows: { value: string | null; count: number }[]): Group[] {
  const map = new Map<string, { values: (string | null)[]; count: number }>();
  for (const r of rows) {
    const seg = segmentOf(r.value);
    const g = map.get(seg) ?? { values: [], count: 0 };
    g.values.push(r.value);
    g.count += r.count;
    map.set(seg, g);
  }
  const other = slugify(OTHER);
  return [...map.entries()]
    .map(([seg, g]) => ({ name: displayName(g.values), seg, count: g.count }))
    .sort((a, b) => (a.seg === other ? 1 : 0) - (b.seg === other ? 1 : 0) || a.name.localeCompare(b.name));
}

// ---------- queries ----------

export function subjectWhere(subject: string): Prisma.LibraryDocWhereInput {
  if (subject === UNSORTED.slug) return { OR: [{ subject: null }, { subject: { notIn: SUBJECT_SLUGS } }] };
  return { subject };
}

function fieldWhere(field: "source" | "topic", values: (string | null)[]): Prisma.LibraryDocWhereInput {
  const named = values.filter((v): v is string => v !== null);
  const or: Prisma.LibraryDocWhereInput[] = [];
  if (named.length) or.push({ [field]: { in: named } });
  if (values.includes(null) || named.some((v) => !v.trim())) or.push({ [field]: null });
  return or.length === 1 ? or[0] : { OR: or };
}

/** Item count per subject slug, plus "unsorted". */
export async function subjectCounts(): Promise<Record<string, number>> {
  const rows = await prisma.libraryDoc.groupBy({ by: ["subject"], _count: { _all: true } });
  const out: Record<string, number> = { [UNSORTED.slug]: 0 };
  for (const s of SUBJECTS) out[s.slug] = 0;
  for (const r of rows) {
    const key = r.subject && isSubject(r.subject) ? r.subject : UNSORTED.slug;
    out[key] += r._count._all;
  }
  return out;
}

export async function sourcesIn(subject: string): Promise<Group[]> {
  const rows = await prisma.libraryDoc.groupBy({ by: ["source"], where: subjectWhere(subject), _count: { _all: true } });
  return groupBySegment(rows.map((r) => ({ value: r.source, count: r._count._all })));
}

/** The stored source values a segment stands for inside a subject, or null if none match. */
export async function resolveSource(subject: string, seg: string): Promise<{ name: string; values: (string | null)[] } | null> {
  const rows = await prisma.libraryDoc.findMany({ where: subjectWhere(subject), distinct: ["source"], select: { source: true } });
  const values = valuesForSegment(rows.map((r) => r.source), seg);
  return values.length ? { name: displayName(values), values } : null;
}

export async function topicsIn(subject: string, sourceValues: (string | null)[]): Promise<Group[]> {
  const rows = await prisma.libraryDoc.groupBy({
    by: ["topic"],
    where: { AND: [subjectWhere(subject), fieldWhere("source", sourceValues)] },
    _count: { _all: true },
  });
  return groupBySegment(rows.map((r) => ({ value: r.topic, count: r._count._all })));
}

export async function resolveTopic(
  subject: string,
  sourceValues: (string | null)[],
  seg: string,
): Promise<{ name: string; values: (string | null)[] } | null> {
  const rows = await prisma.libraryDoc.findMany({
    where: { AND: [subjectWhere(subject), fieldWhere("source", sourceValues)] },
    distinct: ["topic"],
    select: { topic: true },
  });
  const values = valuesForSegment(rows.map((r) => r.topic), seg);
  return values.length ? { name: displayName(values), values } : null;
}

const itemSelect = {
  slug: true,
  title: true,
  kind: true,
  summary: true,
  subject: true,
  source: true,
  topic: true,
  origin: true,
  purpose: true,
  steps: true,
  url: true,
  tldr: true,
  useWhen: true,
  fromLine: true,
  example: true,
  links: true,
  related: true,
  visual: true,
  groupLabel: true,
} satisfies Prisma.LibraryDocSelect;

export type LibraryItem = Prisma.LibraryDocGetPayload<{ select: typeof itemSelect }>;

/** Plain, serializable shape for cards and the pop-up (client components). */
export type CardItem = {
  slug: string;
  title: string;
  kind: string | null;
  kindLabel: string;
  summary: string | null;
  origin: string | null;
  purpose: string | null;
  steps: string[];
  url: string | null;
  path: string;
  tldr: string | null;
  useWhen: string | null;
  fromLine: string | null;
  example: Example | null;
  links: ItemLink[];
  related: Related[];
  visual: Visual | null;
  groupLabel: string | null;
};

export function toCard(d: LibraryItem): CardItem {
  const subject = d.subject ? (subjectInfo(d.subject)?.label ?? d.subject) : UNSORTED.label;
  return {
    slug: d.slug,
    title: d.title,
    kind: d.kind,
    kindLabel: kindLabel(d.kind),
    summary: d.summary,
    origin: d.origin,
    purpose: d.purpose,
    steps: parseSteps(d.steps),
    url: d.url,
    path: [subject, d.source || OTHER, d.topic || OTHER].join(" / "),
    tldr: d.tldr?.trim() || null,
    useWhen: d.useWhen?.trim() || null,
    fromLine: d.fromLine?.trim() || null,
    example: parseExample(d.example),
    links: parseLinks(d.links),
    related: parseRelated(d.related),
    visual: parseVisual(d.visual),
    groupLabel: d.groupLabel?.trim() || null,
  };
}

const KIND_PLURALS: Record<string, string> = {
  sop: "SOPs",
  research: "Research",
  method: "Methods",
  report: "Reports",
  chat: "Chats",
  note: "Notes",
  link: "Links",
};
const KIND_ORDER = ["sop", "research", "chat", "report", "method", "note", "link"];

export type KindFilter = { kind: string; label: string; count: number };

/** Segmented control options: "all" first, then each kind present, with counts. Items with no kind
 * count as "doc". Fewer than two kinds means no control is needed, so this returns []. */
export function kindFilters(items: { kind: string | null }[]): KindFilter[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.kind ?? "doc", (counts.get(it.kind ?? "doc") ?? 0) + 1);
  if (counts.size < 2) return [];
  const rank = (k: string) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : 99);
  const kinds = [...counts.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return [
    { kind: "all", label: "All", count: items.length },
    ...kinds.map((k) => ({ kind: k, label: KIND_PLURALS[k] ?? (k === "doc" ? "Other" : k), count: counts.get(k)! })),
  ];
}

export function matchesKind(item: { kind: string | null }, filter: string): boolean {
  return filter === "all" || (item.kind ?? "doc") === filter;
}

export async function itemsIn(subject: string, sourceValues: (string | null)[], topicValues: (string | null)[]): Promise<LibraryItem[]> {
  return prisma.libraryDoc.findMany({
    where: { AND: [subjectWhere(subject), fieldWhere("source", sourceValues), fieldWhere("topic", topicValues)] },
    orderBy: [{ order: "asc" }, { title: "asc" }],
    select: itemSelect,
  });
}

/** Search words from a query: lowercased, split on anything that is not a letter or digit, words under
 * 2 characters dropped, at most 6. A word of 4+ characters ending in "s" loses the "s" (videos -> video),
 * so a contains match finds both forms. */
export function searchTerms(q: string): string[] {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2)
    .map((w) => (w.length >= 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  return [...new Set(words)].slice(0, 6);
}

/** How many terms appear in a title. Used to put title matches first. */
export function titleHits(title: string, terms: string[]): number {
  const t = title.toLowerCase();
  return terms.filter((w) => t.includes(w)).length;
}

/** Every word must match title, summary, tldr, topic, source or purpose (case-insensitive). Title matches first. */
export async function searchLibrary(q: string, take = 100): Promise<LibraryItem[]> {
  const terms = searchTerms(q);
  if (terms.length === 0) return [];
  const rows = await prisma.libraryDoc.findMany({
    where: {
      AND: terms.map((w) => {
        const contains = { contains: w, mode: "insensitive" as const };
        return {
          OR: [{ title: contains }, { summary: contains }, { tldr: contains }, { topic: contains }, { source: contains }, { purpose: contains }],
        };
      }),
    },
    orderBy: [{ title: "asc" }],
    take: 500,
    select: itemSelect,
  });
  return rows
    .map((r, i) => ({ r, i, hits: titleHits(r.title, terms) }))
    .sort((a, b) => b.hits - a.hits || a.i - b.i)
    .slice(0, take)
    .map((x) => x.r);
}

/** Distinct non-empty sources and topics, for the Add new form's suggestions. */
export async function knownSourcesAndTopics(): Promise<{ sources: string[]; topics: string[] }> {
  const [s, t] = await Promise.all([
    prisma.libraryDoc.findMany({ where: { source: { not: null } }, distinct: ["source"], select: { source: true } }),
    prisma.libraryDoc.findMany({ where: { topic: { not: null } }, distinct: ["topic"], select: { topic: true } }),
  ]);
  const clean = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))].sort((a, b) => a.localeCompare(b));
  return { sources: clean(s.map((r) => r.source)), topics: clean(t.map((r) => r.topic)) };
}

/** Href for a level of the drill-down. */
export function browseHref(subject: string, source?: string | null, topic?: string | null): string {
  let h = `/library/browse/${subject}`;
  if (source !== undefined) h += `/${segmentOf(source)}`;
  if (source !== undefined && topic !== undefined) h += `/${segmentOf(topic)}`;
  return h;
}
