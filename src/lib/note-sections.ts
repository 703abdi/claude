/** Split a markdown note into sections for the reader. Pure, no React.
 * - A chat (any line starting with "**You:**") splits at each of those turns. The label is the first
 *   words of the question (max 8).
 * - Anything else splits at h1 to h3 headings. Lines inside ``` code fences never split.
 * - Text before the first split becomes an "Intro" section when it has words in it.
 * Frontmatter is dropped. */

export type NoteSection = { id: string; label: string; body: string };

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const YOU = /^\s*\*\*You:?\*\*:?\s*(.*)$/;

export function sectionSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "section"
  );
}

/** Plain text of a markdown line: no links, emphasis, code ticks or wiki brackets. */
export function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstWords(text: string, n: number): string {
  const words = plainText(text).split(" ").filter(Boolean);
  if (words.length <= n) return words.join(" ");
  return words.slice(0, n).join(" ") + "...";
}

function stripFrontmatter(md: string): string {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

export function splitSections(source: string): NoteSection[] {
  const lines = stripFrontmatter(source ?? "").split(/\r?\n/);
  if (!lines.some((l) => l.trim())) return [];

  // Find the lines that start a section, skipping code fences.
  let inFence = false;
  const isChat = lines.some((l) => YOU.test(l));
  const starts: { at: number; label: string }[] = [];
  lines.forEach((line, i) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (isChat) {
      const m = line.match(YOU);
      if (m) {
        // The question may start on the next non-empty line.
        let q = m[1];
        for (let j = i + 1; !plainText(q) && j < lines.length && j < i + 6; j++) q = lines[j];
        starts.push({ at: i, label: firstWords(q, 8) || "You asked" });
      }
    } else {
      const m = line.match(HEADING);
      if (m) starts.push({ at: i, label: plainText(m[2]) || "Section" });
    }
  });

  const used = new Map<string, number>();
  const uniqueId = (label: string) => {
    const base = sectionSlug(label);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  const sections: NoteSection[] = [];
  const firstAt = starts.length ? starts[0].at : lines.length;
  const intro = lines.slice(0, firstAt).join("\n");
  // A title line on its own (the usual "# Chat name" above the first turn) is not worth a section.
  const introWords = plainText(lines.slice(0, firstAt).filter((l) => !HEADING.test(l)).join(" "));
  if (introWords) {
    sections.push({ id: uniqueId("Intro"), label: "Intro", body: intro.trim() });
  }
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].at : lines.length;
    const body = lines.slice(s.at, end).join("\n").trim();
    sections.push({ id: uniqueId(s.label), label: s.label, body });
  });
  return sections;
}
