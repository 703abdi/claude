/** Pull names (and an email when there is one) out of a contacts export: a CSV from Google,
 * iCloud or a spreadsheet, or a .vcf vCard file. Pure, runs in the browser. */

export type ImportedContact = { name: string; email: string | null };

const MAX = 300;

export function parseContacts(text: string, filename = ""): ImportedContact[] {
  const body = text.replace(/^﻿/, "");
  const list = /\.vcf$/i.test(filename) || /^BEGIN:VCARD/im.test(body) ? parseVcf(body) : parseCsv(body);
  const seen = new Set<string>();
  const out: ImportedContact[] = [];
  for (const c of list) {
    const key = c.name.toLowerCase();
    if (!c.name || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX) break;
  }
  return out;
}

function parseVcf(text: string): ImportedContact[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  return cards.map((card) => {
    const unfolded = card.replace(/\r?\n[ \t]/g, "");
    const fn = unfolded.match(/^FN(?:;[^:]*)?:(.+)$/im)?.[1]?.trim();
    const n = unfolded.match(/^N(?:;[^:]*)?:([^;\r\n]*);([^;\r\n]*)/im);
    const fromN = n ? `${n[2].trim()} ${n[1].trim()}`.trim() : "";
    const email = unfolded.match(/^EMAIL(?:;[^:]*)?:(.+)$/im)?.[1]?.trim().toLowerCase() ?? null;
    return { name: clean(fn || fromN), email };
  });
}

function parseCsv(text: string): ImportedContact[] {
  const rows = splitCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "")));
  const iName = find("name", "full name", "display name", "contact");
  const iFirst = find("first name", "given name", "first");
  const iLast = find("last name", "family name", "surname", "last");
  const iEmail = header.findIndex((h) => h.includes("e-mail") || h.includes("email"));
  const hasHeader = iName >= 0 || iFirst >= 0 || iEmail >= 0;
  const data = hasHeader ? rows.slice(1) : rows;
  return data.map((r) => {
    const name = hasHeader
      ? iName >= 0 && r[iName]?.trim()
        ? r[iName]
        : `${r[iFirst] ?? ""} ${r[iLast] ?? ""}`
      : r[0] ?? "";
    const email = hasHeader && iEmail >= 0 ? r[iEmail]?.trim().toLowerCase() || null : r.find((c) => c.includes("@"))?.trim().toLowerCase() ?? null;
    return { name: clean(name), email };
  });
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}
