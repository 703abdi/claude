# Obsidian sync agent

A small local Node script that watches your Obsidian vault (or any folder
of markdown files) and incrementally pushes changed notes to your personal
OS's Context Engine. Vercel can't read files on your Mac, so this agent
runs on your machine and does the pushing.

## Setup

```bash
cd sync-agent
npm install
cp .env.example .env
```

Edit `.env`:

- `VAULT_PATH` — absolute path to your vault
- `INCLUDE_FOLDERS` / `EXCLUDE_FOLDERS` — comma-separated, relative to the vault root
- `SERVER_URL` — your deployed app's URL
- `SYNC_TOKEN` — must match the `OBSIDIAN_SYNC_TOKEN` environment variable set on the deployed app (generate one with `openssl rand -hex 32` and put the same value in both places)

## Run

```bash
npm start          # watches continuously, pushes a batch every SYNC_INTERVAL_SECONDS
npm run sync-once   # scans once, pushes whatever changed, exits — good for cron/launchd
```

State (a hash per file) is kept in `.sync-state.json` next to the script
so unchanged files are never re-uploaded, even across restarts.

## What gets sent

Only `.md` files under the included folders, minus excluded ones. Each
sync batch is `{ notes: [{ path, content, mtime }], deletedPaths: [] }`,
authenticated with `Authorization: Bearer <SYNC_TOKEN>`. The server
normalizes each note into a `ContextItem`, keyed by file path, and runs
the commitment/blocker extraction pipeline on anything new or changed.
