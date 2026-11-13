#!/usr/bin/env node
// Reads the Claude Code sessions from the local JARVIS server and posts them to
// the Personal OS at /api/mac/status, so Home can show what the Mac is doing.
// Plain Node, no dependencies. Run with --dry-run to print the payload and send nothing.
//
// JARVIS (github.com/ethanplusai/jarvis) serves GET /api/sessions on 127.0.0.1:8340.
// It uses HTTPS with a self-signed cert when cert.pem and key.pem are present, plain
// HTTP otherwise. Reads need no token, but we send the tool token anyway in case that changes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import http from "node:http";

const DRY_RUN = process.argv.includes("--dry-run");
const SERVER_URL = (process.env.SERVER_URL || "https://claude-tau-six.vercel.app").replace(/\/+$/, "");
const JARVIS_HOST = "127.0.0.1";
const JARVIS_PORT = Number(process.env.JARVIS_PORT || 8340);
const JARVIS_HOME = process.env.JARVIS_HOME || path.join(os.homedir(), "Projects", "jarvis");
const JARVIS_DATA = process.env.JARVIS_DATA_DIR || path.join(JARVIS_HOME, "data");
const TOOL_TOKEN_FILE = path.join(JARVIS_DATA, "jarvis", "tool-token");
const AGENTS_TOKEN_FILE = path.join(os.homedir(), ".config", "personal-os", "agents-token");
const MAX_SESSIONS = 30;
const MAX_TEXT = 200;

function readToken(file) {
  try {
    return fs.readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** GET a JSON path on the local JARVIS. The self-signed cert is accepted only because the host is 127.0.0.1. */
function getLocal(scheme, urlPath, token) {
  const lib = scheme === "https" ? https : http;
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        host: JARVIS_HOST,
        port: JARVIS_PORT,
        path: urlPath,
        method: "GET",
        headers,
        timeout: 5000,
        ...(scheme === "https" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`JARVIS answered ${res.statusCode}`));
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("JARVIS sent something that is not JSON"));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("JARVIS timed out")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchSessions() {
  const token = readToken(TOOL_TOKEN_FILE);
  let lastError = null;
  for (const scheme of ["https", "http"]) {
    try {
      const body = await getLocal(scheme, "/api/sessions", token);
      return { ok: true, scheme, rows: Array.isArray(body?.sessions) ? body.sessions : [] };
    } catch (err) {
      lastError = err;
    }
  }
  return { ok: false, error: lastError ? String(lastError.message || lastError) : "unknown", rows: [] };
}

const cap = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "");

/** JARVIS states: needs_you, working, shell, idle, unknown, fresh, gone. */
function mapSession(s) {
  const name = cap(s.voice_name || s.project || s.roster_name || s.session_id || "session");
  const summary = cap(s.summary || s.title || s.last_prompt || "");
  switch (s.state) {
    case "needs_you":
      return { name, state: "waiting", detail: cap(s.needs ? `${s.needs}${summary ? `: ${summary}` : ""}` : summary || "Wants you") };
    case "working":
    case "shell":
      return { name, state: "running", ...(summary ? { detail: summary } : {}) };
    case "idle":
    case "unknown":
      return { name, state: "idle", ...(summary ? { detail: summary } : {}) };
    default:
      return null; // fresh (never prompted) and gone (finished) are left out
  }
}

const ORDER = { waiting: 0, running: 1, idle: 2 };

async function main() {
  const local = await fetchSessions();
  const sessions = local.rows
    .map(mapSession)
    .filter(Boolean)
    .sort((a, b) => ORDER[a.state] - ORDER[b.state])
    .slice(0, MAX_SESSIONS);
  const payload = { sessions };

  if (DRY_RUN) {
    console.log(local.ok ? `JARVIS reachable over ${local.scheme}, ${local.rows.length} rows.` : `JARVIS not reachable (${local.error}). Would post an empty list.`);
    console.log(`Would POST to ${SERVER_URL}/api/mac/status:`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const bearer = readToken(AGENTS_TOKEN_FILE);
  if (!bearer) {
    console.error(`No agents token at ${AGENTS_TOKEN_FILE}. Nothing sent.`);
    process.exit(1);
  }
  const res = await fetch(`${SERVER_URL}/api/mac/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.error(`Report failed with ${res.status}.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`mac-report: ${err?.message || err}`);
  process.exit(1);
});
