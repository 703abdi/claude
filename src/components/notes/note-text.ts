// Small text helpers for the Notes page. Safe to import in the browser.

type NoteLike = { title: string; body: string; pinned: boolean; updatedAt: string };

/** The title, else the first line of the body, else "Untitled". */
export function displayTitle(n: { title: string; body: string }): string {
  const t = n.title.trim();
  if (t) return t;
  const first = n.body.split("\n").find((l) => l.trim());
  return first ? first.trim().slice(0, 120) : "Untitled";
}

/** One line of the body for the list. Skips the line already used as the title. */
export function preview(n: { title: string; body: string }): string {
  const lines = n.body.split("\n").map((l) => l.trim()).filter(Boolean);
  const rest = n.title.trim() ? lines : lines.slice(1);
  return rest.join(" ").slice(0, 160);
}

/** Pinned first, then newest edited. */
export function sortNotes<T extends NoteLike>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}
