/** Pure helpers for showing a Library item: parse the JSON fields into safe shapes and group cards.
 * No server imports, so client components can use this file. */

export type Visual =
  | { type: "flow" }
  | { type: "formula"; parts: string[]; result: string }
  | { type: "twocol"; leftLabel: string; left: string[]; rightLabel: string; right: string[] }
  | { type: "funnel"; stages: string[] }
  | { type: "numbers"; items: { value: string; label: string }[] };

export type Example = { text: string; label: string | null };
export type ItemLink = { label: string; url: string };
export type Related = { slug: string; title: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strs = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null).slice(0, max) : [];

/** A visual the app can draw, or null when it is missing or malformed. */
export function parseVisual(v: unknown): Visual | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case "flow":
      return { type: "flow" };
    case "formula": {
      const parts = strs(v.parts, 4);
      const result = str(v.result);
      return parts.length >= 1 && result ? { type: "formula", parts, result } : null;
    }
    case "twocol": {
      const left = strs(v.left, 3);
      const right = strs(v.right, 3);
      if (!left.length && !right.length) return null;
      return { type: "twocol", leftLabel: str(v.leftLabel) ?? "", left, rightLabel: str(v.rightLabel) ?? "", right };
    }
    case "funnel": {
      const stages = strs(v.stages, 5);
      return stages.length >= 2 ? { type: "funnel", stages } : null;
    }
    case "numbers": {
      const items = (Array.isArray(v.items) ? v.items : [])
        .filter(isObj)
        .map((i) => ({ value: str(i.value), label: str(i.label) ?? "" }))
        .filter((i): i is { value: string; label: string } => i.value !== null)
        .slice(0, 3);
      return items.length ? { type: "numbers", items } : null;
    }
    default:
      return null;
  }
}

export function parseExample(v: unknown): Example | null {
  if (!isObj(v)) return null;
  const text = str(v.text);
  return text ? { text, label: str(v.label) } : null;
}

export function parseLinks(v: unknown): ItemLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map((l) => ({ label: str(l.label), url: str(l.url) }))
    .filter((l): l is ItemLink => !!l.label && !!l.url && /^https?:\/\//i.test(l.url))
    .slice(0, 5);
}

export function parseRelated(v: unknown): Related[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map((r) => ({ slug: str(r.slug), title: str(r.title) }))
    .filter((r): r is Related => !!r.slug && !!r.title)
    .slice(0, 3);
}

/** "https://www.example.com/a/b" -> "example.com". */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Do / Don't style labels get a drawn check and cross. */
export function isDoDont(left: string, right: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return norm(left) === "do" && norm(right) === "dont";
}

export type CardGroup<T> = { label: string | null; items: T[] };

/** Cards in headed groups, in first-seen order. Ungrouped items come last under "Other", but only
 * when some items are grouped; with no group labels at all there is one unlabelled group. */
export function groupItems<T extends { groupLabel: string | null }>(items: T[]): CardGroup<T>[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  const loose: T[] = [];
  for (const it of items) {
    const g = it.groupLabel?.trim();
    if (!g) {
      loose.push(it);
      continue;
    }
    if (!map.has(g)) {
      map.set(g, []);
      order.push(g);
    }
    map.get(g)!.push(it);
  }
  if (order.length === 0) return items.length ? [{ label: null, items }] : [];
  const groups: CardGroup<T>[] = order.map((g) => ({ label: g, items: map.get(g)! }));
  if (loose.length) groups.push({ label: "Other", items: loose });
  return groups;
}
