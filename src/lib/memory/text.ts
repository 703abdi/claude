import { createHash } from "crypto";

/** Pure text helpers for memory. No database here, so tests can use them directly. */

export const CHUNK_SIZE = 3500;

/** Line endings to \n, no NUL bytes (Postgres text refuses them), no trailing spaces, at most one blank line in a row. */
export function normaliseText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hashDoc(title: string, body: string): string {
  return createHash("sha256").update(title).update("\n\u0001\n").update(body).digest("hex");
}

/** Cut a piece longer than max at the last space before max. A single word longer than max is cut hard. */
function splitLong(piece: string, max: number): string[] {
  const out: string[] = [];
  let rest = piece;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) {
      const nl = rest.lastIndexOf("\n", max);
      if (nl > cut) cut = nl;
    }
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Split text into chunks of about `max` characters on paragraph boundaries. Paragraphs that are too
 * long are split on line breaks, then on spaces. Never cuts inside a word unless one word is longer than max. */
export function chunkText(text: string, max = CHUNK_SIZE): string[] {
  const clean = normaliseText(text);
  if (!clean) return [""];
  if (clean.length <= max) return [clean];

  const pieces: string[] = [];
  for (const para of clean.split("\n\n")) {
    if (para.length <= max) {
      pieces.push(para);
      continue;
    }
    // Long paragraph: try lines first, then spaces.
    let line = "";
    for (const l of para.split("\n")) {
      if (l.length > max) {
        if (line) pieces.push(line);
        line = "";
        pieces.push(...splitLong(l, max));
      } else if (line && line.length + 1 + l.length > max) {
        pieces.push(line);
        line = l;
      } else {
        line = line ? `${line}\n${l}` : l;
      }
    }
    if (line) pieces.push(line);
  }

  const chunks: string[] = [];
  let cur = "";
  for (const p of pieces) {
    if (!cur) cur = p;
    else if (cur.length + 2 + p.length <= max) cur = `${cur}\n\n${p}`;
    else {
      chunks.push(cur);
      cur = p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const OR_STOP = new Set(["or", "and", "not"]);

/** Words in the query, for the loose retry. Letters and digits only, so no search operators get through. */
export function queryWords(query: string): string[] {
  const words = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !OR_STOP.has(w));
  return [...new Set(words)].slice(0, 12);
}

/** "omar lunch friday" -> "omar or lunch or friday", for websearch_to_tsquery. */
export function orQuery(query: string): string {
  return queryWords(query).join(" or ");
}

/** A query worth sending to Postgres: has at least one letter or digit. */
export function isSearchable(query: string): boolean {
  return /[\p{L}\p{N}]/u.test(query);
}

/** Plain-text snippet: no tags, single spaces, about `max` characters, cut on a word. */
export function cleanSnippet(s: string, max = 300): string {
  const plain = s
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.lastIndexOf(" ", max);
  return `${plain.slice(0, cut > max * 0.6 ? cut : max).trim()} ...`;
}
