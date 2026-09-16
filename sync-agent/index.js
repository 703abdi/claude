import "dotenv/config";
import { watch } from "chokidar";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { readFile as readFileAsync, stat as statAsync } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, ".sync-state.json");

const VAULT_PATH = process.env.VAULT_PATH;
const SERVER_URL = process.env.SERVER_URL;
const SYNC_TOKEN = process.env.SYNC_TOKEN;
const INCLUDE_FOLDERS = (process.env.INCLUDE_FOLDERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const EXCLUDE_FOLDERS = (process.env.EXCLUDE_FOLDERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SYNC_INTERVAL_MS = Math.max(10, Number(process.env.SYNC_INTERVAL_SECONDS) || 60) * 1000;
const RUN_ONCE = process.argv.includes("--once");

if (!VAULT_PATH || !SERVER_URL || !SYNC_TOKEN) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and set VAULT_PATH, SERVER_URL, SYNC_TOKEN."
  );
  process.exit(1);
}

function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
  } catch {
    return {};
  }
}
function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function hashContent(content) {
  return createHash("sha1").update(content).digest("hex");
}

function relativePath(absPath) {
  return path.relative(VAULT_PATH, absPath).split(path.sep).join("/");
}

function isIncluded(relPath) {
  if (!relPath.endsWith(".md")) return false;
  if (EXCLUDE_FOLDERS.some((f) => relPath === f || relPath.startsWith(f + "/"))) return false;
  if (INCLUDE_FOLDERS.length > 0 && !INCLUDE_FOLDERS.some((f) => relPath.startsWith(f + "/"))) return false;
  return true;
}

const state = loadState(); // relPath -> { hash, mtime }
const pendingChanges = new Map(); // relPath -> absPath
const pendingDeletes = new Set(); // relPath

async function queueChange(absPath) {
  const relPath = relativePath(absPath);
  if (!isIncluded(relPath)) return;
  pendingChanges.set(relPath, absPath);
  pendingDeletes.delete(relPath);
}

function queueDelete(absPath) {
  const relPath = relativePath(absPath);
  if (!relPath.endsWith(".md")) return;
  pendingDeletes.add(relPath);
  pendingChanges.delete(relPath);
}

async function flush() {
  if (pendingChanges.size === 0 && pendingDeletes.size === 0) return;

  const notes = [];
  for (const [relPath, absPath] of pendingChanges) {
    let content;
    try {
      content = await readFileAsync(absPath, "utf-8");
    } catch {
      continue; // file removed between queue and flush — next watcher event will handle it
    }
    const hash = hashContent(content);
    if (state[relPath]?.hash === hash) {
      pendingChanges.delete(relPath);
      continue; // unchanged — incremental sync skips it (spec §33)
    }
    const stat = await statAsync(absPath);
    notes.push({ path: relPath, content, mtime: stat.mtime.toISOString() });
  }

  const deletedPaths = [...pendingDeletes];

  if (notes.length === 0 && deletedPaths.length === 0) {
    pendingChanges.clear();
    pendingDeletes.clear();
    return;
  }

  console.log(
    `[sync] pushing ${notes.length} changed note(s), ${deletedPaths.length} deletion(s)...`
  );

  try {
    const res = await fetch(`${SERVER_URL}/api/sync/obsidian`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SYNC_TOKEN}` },
      body: JSON.stringify({ notes, deletedPaths }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[sync] server rejected batch: ${res.status} ${text}`);
      return; // leave items queued for retry next interval
    }

    const result = await res.json();
    console.log(`[sync] ok — ingested ${result.ingested}, deleted ${result.deleted ?? 0}`);

    for (const note of notes) {
      state[note.path] = { hash: hashContent(note.content), mtime: note.mtime };
      pendingChanges.delete(note.path);
    }
    for (const relPath of deletedPaths) {
      delete state[relPath];
      pendingDeletes.delete(relPath);
    }
    saveState(state);
  } catch (err) {
    console.error(`[sync] network error, will retry next interval:`, err.message);
  }
}

console.log(`[sync] watching ${VAULT_PATH}`);
if (INCLUDE_FOLDERS.length) console.log(`[sync] include: ${INCLUDE_FOLDERS.join(", ")}`);
if (EXCLUDE_FOLDERS.length) console.log(`[sync] exclude: ${EXCLUDE_FOLDERS.join(", ")}`);

const watcher = watch(VAULT_PATH, {
  ignoreInitial: false,
  persistent: !RUN_ONCE,
  awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
});

watcher.on("add", queueChange);
watcher.on("change", queueChange);
watcher.on("unlink", queueDelete);

if (RUN_ONCE) {
  watcher.on("ready", async () => {
    await flush();
    await watcher.close();
    process.exit(0);
  });
} else {
  watcher.on("ready", () => {
    console.log("[sync] initial scan complete, watching for changes...");
    setInterval(flush, SYNC_INTERVAL_MS);
  });
}
