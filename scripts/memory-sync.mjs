#!/usr/bin/env node
// Sends the Obsidian vault to Jarvis memory (POST /api/memory/ingest).
// Only files that changed since the last run are sent (sha256 per file, kept in a state file),
// and files that are gone are reported as deleted. Plain Node, no extra packages.
//
// Usage:
//   node scripts/memory-sync.mjs --dry-run            what would be sent, sends nothing
//   node scripts/memory-sync.mjs                      send changed files
//   node scripts/memory-sync.mjs --folder Chats --limit 50
//
// Env: VAULT_PATH, SERVER_URL, MEMORY_SYNC_TOKEN (else ~/.config/personal-os/agents-token).

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_VAULT = path.join(os.homedir(), "Library/Mobile Documents/iCloud~md~obsidian/Documents/Abdi's Brain");
const VAULT = process.env.VAULT_PATH || DEFAULT_VAULT;
const SERVER = (process.env.SERVER_URL ?? "https://claude-tau-six.vercel.app").replace(/\/+$/, "");
const CONFIG_DIR = path.join(os.homedir(), ".config/personal-os");
const STATE_FILE = path.join(CONFIG_DIR, "memory-sync-state.json");
const TOKEN_FILE = path.join(CONFIG_DIR, "agents-token");

const SKIP_DIRS = new Set([".obsidian", ".trash", "Indexes", "_scripts", "_Import"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const READ_TIMEOUT_MS = 15_000;
const PART_CHARS = 250_000; // the server takes 400,000 chars per doc; this keeps one part well under 900 KB of JSON
const BATCH_BYTES = 900 * 1024;
const BATCH_DOCS = 200;
const DELETE_BATCH = 1000;

function parseArgs(argv) {
  const out = { dryRun: false, limit: Infinity, folder: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--limit") out.limit = Math.max(1, Number(argv[++i]) || 0) || Infinity;
    else if (a === "--folder") out.folder = argv[++i] ?? null;
    else if (a === "--help" || a === "-h") {
      console.log("node scripts/memory-sync.mjs [--dry-run] [--limit N] [--folder <name>]");
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

const mb = (n) => (n / 1024 / 1024).toFixed(1);
const kb = (n) => Math.round(n / 1024);
const sha = (s) => createHash("sha256").update(s).digest("hex");

async function walk(dir, rel, out, skipped) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    skipped.unreadableDirs++;
    return;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      await walk(abs, r, out, skipped);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      out.push({ abs, rel: r });
    }
  }
}

/** Read with a time limit. iCloud may have offloaded the file, and then a read can hang. */
function readWithTimeout(abs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), READ_TIMEOUT_MS);
    fs.readFile(abs, "utf8").then(
      (t) => {
        clearTimeout(timer);
        resolve(t);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function stripFrontmatter(text) {
  let t = text.replace(/^﻿/, "");
  if (t.startsWith("---\n") || t.startsWith("---\r\n")) {
    const m = /\r?\n---[ \t]*(\r?\n|$)/.exec(t.slice(3));
    if (m) t = t.slice(3 + m.index + m[0].length);
  }
  return t.trim();
}

/** Split a very long body into parts on paragraph or line breaks. */
function splitParts(body) {
  if (body.length <= PART_CHARS) return [body];
  const parts = [];
  let rest = body;
  while (rest.length > PART_CHARS) {
    let cut = rest.lastIndexOf("\n\n", PART_CHARS);
    if (cut < PART_CHARS * 0.5) cut = rest.lastIndexOf("\n", PART_CHARS);
    if (cut < PART_CHARS * 0.5) cut = rest.lastIndexOf(" ", PART_CHARS);
    if (cut <= 0) cut = PART_CHARS;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest) parts.push(rest);
  return parts;
}

const partId = (rel, i) => (i === 0 ? rel : `${rel}#part${i + 1}`);

async function loadState() {
  try {
    const json = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    return json && typeof json.files === "object" ? json : { version: 1, files: {} };
  } catch {
    return { version: 1, files: {} };
  }
}

async function saveState(state) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state));
  await fs.rename(tmp, STATE_FILE);
}

async function readToken() {
  if (process.env.MEMORY_SYNC_TOKEN?.trim()) return process.env.MEMORY_SYNC_TOKEN.trim();
  try {
    return (await fs.readFile(TOKEN_FILE, "utf8")).trim();
  } catch {
    return "";
  }
}

async function post(token, payload) {
  const url = `${SERVER}/api/memory/ingest`;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: payload,
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) return await res.json();
      lastErr = `server answered ${res.status}`;
      if (res.status === 401) throw new Error("server said 401 Unauthorized. Check the token.");
      if (res.status < 500 && res.status !== 429) {
        const text = (await res.text()).slice(0, 300);
        throw new Error(`${lastErr}: ${text}`);
      }
    } catch (err) {
      if (err instanceof Error && /401|answered 4/.test(err.message)) throw err;
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`send failed after 3 tries: ${lastErr}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.folder ? path.join(VAULT, args.folder) : VAULT;
  const prefix = args.folder ? `${args.folder.replace(/\/+$/, "")}/` : "";

  try {
    await fs.access(root);
  } catch {
    console.error(`Vault folder not found: ${root}`);
    process.exit(1);
  }

  const skipped = { tooBig: 0, unreadable: 0, timedOut: 0, unreadableDirs: 0 };
  const files = [];
  await walk(root, prefix.replace(/\/$/, ""), files, skipped);

  const state = await loadState();
  const seen = new Set();
  const all = []; // every readable file, for the dry-run report
  const changed = [];
  for (const f of files) {
    let st;
    try {
      st = await fs.stat(f.abs);
    } catch {
      skipped.unreadable++;
      seen.add(f.rel); // do not report as deleted
      continue;
    }
    seen.add(f.rel);
    if (st.size > MAX_FILE_BYTES) {
      skipped.tooBig++;
      continue;
    }
    if (changed.length >= args.limit) continue;
    let text;
    try {
      text = await readWithTimeout(f.abs);
    } catch (err) {
      if (err instanceof Error && err.message === "timeout") skipped.timedOut++;
      else skipped.unreadable++;
      continue;
    }
    const hash = sha(text);
    all.push({ rel: f.rel, size: st.size });
    if (state.files[f.rel]?.hash === hash) continue;
    const body = stripFrontmatter(text);
    const title = path.basename(f.rel).replace(/\.md$/i, "");
    const parts = splitParts(body);
    const docs = parts.map((p, i) => ({
      source: "vault",
      externalId: partId(f.rel, i),
      title: parts.length > 1 ? `${title} (part ${i + 1})` : title,
      body: p,
      url: null,
      date: st.mtime.toISOString(),
    }));
    const oldParts = state.files[f.rel]?.parts ?? 0;
    const dropParts = [];
    for (let i = parts.length; i < oldParts; i++) dropParts.push({ source: "vault", externalId: partId(f.rel, i) });
    changed.push({ rel: f.rel, size: st.size, hash, parts: parts.length, docs, dropParts });
  }

  // Files in the state that are gone. Not with --limit (we did not look at everything).
  const deletedFiles = [];
  if (args.limit === Infinity) {
    for (const rel of Object.keys(state.files)) {
      if (prefix && !rel.startsWith(prefix)) continue;
      if (!seen.has(rel)) deletedFiles.push(rel);
    }
  }

  // Batches: under 900 KB of JSON and at most 200 docs. A file's parts stay in one batch when they fit.
  const batches = [];
  let cur = { docs: [], deleted: [], files: [], bytes: 2 };
  const flush = () => {
    if (cur.docs.length || cur.deleted.length) batches.push(cur);
    cur = { docs: [], deleted: [], files: [], bytes: 2 };
  };
  for (const c of changed) {
    for (const d of c.docs) {
      const size = Buffer.byteLength(JSON.stringify(d)) + 1;
      if (cur.docs.length && (cur.bytes + size > BATCH_BYTES || cur.docs.length >= BATCH_DOCS)) flush();
      cur.docs.push(d);
      cur.bytes += size;
    }
    cur.deleted.push(...c.dropParts);
    cur.files.push(c);
  }
  flush();
  const deleteDocs = deletedFiles.flatMap((rel) => {
    const n = Math.max(1, state.files[rel]?.parts ?? 1);
    return Array.from({ length: n }, (_, i) => ({ source: "vault", externalId: partId(rel, i) }));
  });
  for (let i = 0; i < deleteDocs.length; i += DELETE_BATCH) {
    batches.push({ docs: [], deleted: deleteDocs.slice(i, i + DELETE_BATCH), files: [], bytes: 0, deletes: true });
  }
  const gone = new Set(deletedFiles);

  const totalBytes = all.reduce((t, f) => t + f.size, 0);
  const changedBytes = changed.reduce((t, f) => t + f.size, 0);
  const skipLine = `skipped: ${skipped.tooBig} over 2 MB, ${skipped.timedOut} timed out, ${skipped.unreadable} unreadable${skipped.unreadableDirs ? `, ${skipped.unreadableDirs} folders unreadable` : ""}`;

  if (args.dryRun) {
    console.log(`Vault: ${root}`);
    console.log(`Server: ${SERVER}/api/memory/ingest`);
    console.log(`Markdown files found: ${files.length}`);
    console.log(`Readable files: ${all.length}, ${mb(totalBytes)} MB`);
    console.log(`Changed since last sync: ${changed.length} files, ${mb(changedBytes)} MB, ${changed.reduce((t, c) => t + c.parts, 0)} docs`);
    console.log(`Deleted since last sync: ${deletedFiles.length} files`);
    console.log(skipLine);
    console.log(`Batches to send: ${batches.length} (under ${kb(BATCH_BYTES)} KB and ${BATCH_DOCS} docs each)`);
    console.log("Biggest files:");
    for (const f of [...all].sort((a, b) => b.size - a.size).slice(0, 10)) console.log(`  ${(f.size / 1024).toFixed(0).padStart(6)} KB  ${f.rel}`);
    console.log("Dry run: nothing sent, state file not written.");
    return;
  }

  if (!batches.length) {
    console.log(`Nothing changed. ${all.length} files checked. ${skipLine}`);
    return;
  }

  const token = await readToken();
  if (!token) {
    console.error(`No token. Put it in ${TOKEN_FILE} or set MEMORY_SYNC_TOKEN.`);
    process.exit(1);
  }

  const totals = { upserted: 0, unchanged: 0, deleted: 0 };
  let failed = 0;
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    const payload = JSON.stringify({ docs: b.docs, deleted: b.deleted });
    try {
      const r = await post(token, payload);
      totals.upserted += r.upserted ?? 0;
      totals.unchanged += r.unchanged ?? 0;
      totals.deleted += r.deleted ?? 0;
      // A file counts as synced once its last doc went out. Parts split over two batches
      // are written to state only when the batch with the last part succeeds.
      for (const c of b.files) state.files[c.rel] = { hash: c.hash, parts: c.parts };
      if (b.deletes) {
        for (const d of b.deleted) {
          const rel = d.externalId.replace(/#part\d+$/, "");
          if (gone.has(rel)) delete state.files[rel];
        }
      }
      await saveState(state);
      console.log(`batch ${i + 1}/${batches.length}: ${b.docs.length} docs, ${b.deleted.length} deletes, ${kb(Buffer.byteLength(payload))} KB -> upserted ${r.upserted}, unchanged ${r.unchanged}, deleted ${r.deleted}`);
    } catch (err) {
      failed++;
      console.error(`batch ${i + 1}/${batches.length} failed: ${err instanceof Error ? err.message : String(err)}`);
      if (/401/.test(String(err))) break;
    }
  }
  console.log(
    `Done. ${changed.length} changed files, ${deletedFiles.length} deleted files. Server: upserted ${totals.upserted}, unchanged ${totals.unchanged}, deleted ${totals.deleted}. ${failed} batches failed. ${skipLine}`
  );
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
