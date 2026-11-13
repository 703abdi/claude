import type { ReactNode } from "react";
import Link from "next/link";

/** Small markdown renderer for vault notes: headings, lists, tables, quotes, code, links,
 * [[wikilinks]] (resolved to Library docs when `resolve` knows the title), bold, italic.
 * Frontmatter is stripped. Good enough for SOPs; not a full CommonMark parser. */

export function stripFrontmatter(md: string): { body: string; meta: Record<string, string> } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { body: md, meta: {} };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { body: md.slice(m[0].length), meta };
}

export function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Resolve = (wikiTitle: string) => string | null;

export function Markdown({ source, resolve }: { source: string; resolve?: Resolve }) {
  const lines = stripFrontmatter(source).body.split(/\r?\n/);
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(<pre key={k()} className="md-pre"><code>{buf.join("\n")}</code></pre>);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2], resolve);
      if (level === 1) out.push(<h1 key={k()} className="md-h1">{text}</h1>);
      else if (level === 2) out.push(<h2 key={k()} className="md-h2">{text}</h2>);
      else out.push(<h3 key={k()} className="md-h3">{text}</h3>);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push(<hr key={k()} className="md-hr" />); i++; continue; }

    if (/^\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r: string) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(1).filter((r) => !/^\|\s*:?-{2,}/.test(r)).map(cells);
      out.push(
        <div key={k()} className="md-table-wrap">
          <table className="md-table">
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, resolve)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, resolve)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(<blockquote key={k()} className="md-quote">{inline(buf.join(" "), resolve)}</blockquote>);
      continue;
    }

    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        let text = m[3];
        // continuation lines indented under the item
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*+]|\d+[.)])\s/.test(lines[i + 1])) text += " " + lines[++i].trim();
        const task = text.match(/^\[([ xX])\]\s+(.*)$/);
        items.push(
          <li key={items.length} className={task ? "md-task" : undefined}>
            {task ? <span className={`md-check ${task[1] !== " " ? "md-check-on" : ""}`} aria-hidden /> : null}
            {inline(task ? task[2] : text, resolve)}
          </li>
        );
        i++;
      }
      out.push(ordered ? <ol key={k()} className="md-ol">{items}</ol> : <ul key={k()} className="md-ul">{items}</ul>);
      continue;
    }

    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\||>|(\s*)([-*+]|\d+[.)])\s)/.test(lines[i])) buf.push(lines[i++]);
    out.push(<p key={k()} className="md-p">{inline(buf.join(" "), resolve)}</p>);
  }
  return <div className="md">{out}</div>;
}

function inline(text: string, resolve?: Resolve): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\[\[([^\]|]+)(?:\|([^\]]+))?\]\])|(\[([^\]]+)\]\(([^)\s]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(https?:\/\/[^\s<>)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      const target = m[2].split("#")[0].trim();
      const label = m[3] ?? m[2];
      const href = resolve?.(target) ?? null;
      nodes.push(href ? <Link key={n++} href={href} className="md-link">{label}</Link> : <span key={n++} className="md-wiki">{label}</span>);
    } else if (m[4]) {
      nodes.push(<a key={n++} href={m[6]} target="_blank" rel="noreferrer" className="md-link">{m[5]}</a>);
    } else if (m[7]) {
      nodes.push(<code key={n++} className="md-code">{m[8]}</code>);
    } else if (m[9]) {
      nodes.push(<strong key={n++}>{m[10]}</strong>);
    } else if (m[11]) {
      nodes.push(<em key={n++}>{m[12]}</em>);
    } else if (m[13]) {
      nodes.push(<a key={n++} href={m[13]} target="_blank" rel="noreferrer" className="md-link">{m[13].replace(/^https?:\/\//, "")}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
