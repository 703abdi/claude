# abdi's os

A private personal operating system: one dashboard for what needs to
happen, what's overdue, who's waiting on you, and what actually matters
today. Built with Next.js (App Router), TypeScript, Tailwind CSS,
PostgreSQL, and Prisma.

Not a generic to-do app — see the full product spec in the original
request for the philosophy behind priority ordering, the red/orange/
yellow/green status system, and the Context Engine. This README covers
what's here and how to run it.

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript + Tailwind CSS v4
- **PostgreSQL** via **Prisma 6** — the database is the system of record
- Single-user auth: bcrypt-hashed password, signed JWT session cookie
  (no third-party auth provider, no domain required)
- **Anthropic (Claude)** for context extraction, morning brief
  composition, and suggestion generation — every AI feature degrades to
  a real, working non-AI fallback when `ANTHROPIC_API_KEY` is unset
  (never fakes a result)
- **OpenAI / ElevenLabs TTS** (optional) for morning brief audio
- Deploys to **Vercel**

## Architecture

```
EXTERNAL SOURCES (Obsidian, ChatGPT export, Claude export)
        ↓ authenticated ingestion endpoints
   CONTEXT ENGINE (src/lib/context/)
        ↓ normalize → extract (Claude, or graceful no-op)
   CONTEXT DATABASE (ContextItem)
        ↓
   AI ANALYSIS (src/lib/priority-engine.ts, suggestion-detectors.ts)
        ↓
   TASKS ←→ SUGGESTIONS ←→ MORNING BRIEF
        ↓
   EXECUTION (the UI)
```

If the AI layer is fully unconfigured, the task system, People, Calendar,
and rule-based suggestion detectors still work end to end — the LLM is a
recommendation layer on top, never a dependency of the core product.

## Local setup

Requires Node 20+ and a PostgreSQL database (local or hosted).

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD at minimum
npx prisma migrate dev
npm run db:seed        # creates your admin user + realistic demo data (all tagged isSeed: true)
npm run dev
```

Open http://localhost:3000 and sign in with the `ADMIN_EMAIL` /
`ADMIN_PASSWORD` you set.

### Removing the demo data

Everything the seed script creates is tagged `isSeed: true` on Task,
Category, Person, and CalendarEvent. Delete it whenever you're ready for
your own data — for example:

```sql
DELETE FROM "Task" WHERE "isSeed" = true;
DELETE FROM "CalendarEvent" WHERE "isSeed" = true;
DELETE FROM "Person" WHERE "isSeed" = true;
DELETE FROM "Category" WHERE "isSeed" = true;
```

(Deleting seed Tasks cascades their steps, dependencies, and links.)

## Environment variables

See `.env.example` for the full list with comments. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `AUTH_SECRET` | yes | Session JWT signing key |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | yes | Your login — set once, re-run `db:seed` to apply |
| `ANTHROPIC_API_KEY` | no | Enables context extraction, AI-composed morning briefs, LLM-derived suggestions |
| `TTS_PROVIDER` (`openai`/`elevenlabs`) + matching API key | no | Enables morning brief audio |
| `OBSIDIAN_SYNC_TOKEN` | no | Enables the local Obsidian sync agent |
| `CHATGPT_CONNECTOR_TOKEN` | no | Enables the bearer-token ChatGPT ingestion endpoint (the manual upload in Settings works without it) |
| `CLAUDE_CONNECTOR_TOKEN` | no | Enables the bearer-token Claude ingestion endpoint (the manual upload in Settings works without it) |
| `CRON_SECRET` | no | Enables the daily-refresh Vercel Cron job |

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Provision Postgres (Vercel Postgres, Neon, or Supabase all work) and set `DATABASE_URL`.
3. Set the required env vars above in the Vercel project settings.
4. The build command is already wired: `npm run vercel-build` runs `prisma generate && prisma migrate deploy && next build`.
5. After the first deploy, run the seed script once against the production database (`DATABASE_URL=... npm run db:seed` locally, pointed at prod) to create your admin user.
6. No custom domain needed — use the `*.vercel.app` URL Vercel gives you.

### Cron / daily refresh

`vercel.json` schedules `/api/cron/daily-refresh` once a day (Vercel
Cron runs on a fixed UTC time; Hobby plans only support daily
granularity). Set `CRON_SECRET` and adjust the `schedule` in
`vercel.json` to land near your morning — the time/timezone shown in
Settings is what the UI displays and what future finer-grained
scheduling would use, but Hobby-tier Vercel Cron itself doesn't support
per-minute personalization. You can always trigger the same pipeline
on demand from Settings → "Run daily refresh now".

### Audio storage

Morning brief audio is generated as MP3 and stored as bytes directly in
Postgres (`MorningBrief.audioData`), streamed back through
`/api/morning-brief/[id]/audio` with HTTP Range support for seeking.
This avoids needing separate blob storage and works out of the box on
Vercel's serverless functions, which have no persistent/writable
filesystem.

## The Obsidian sync agent

A real, local Node script — see `sync-agent/README.md`. It watches your
vault, hashes files to sync only what changed, and pushes to
`/api/sync/obsidian` with a bearer token. Nothing runs on the server to
read your filesystem; Vercel can't do that, so this has to run on your
machine (a background `npm start`, or `npm run sync-once` from cron/launchd).

## The ChatGPT connector

There is no public API for a third party to pull a user's ChatGPT
conversation history — this is a real constraint, not a corner we cut.
The working path: export your data from ChatGPT (Settings → Data
controls → Export), then upload the `conversations.json` file in
Settings → ChatGPT context. A bearer-token batch endpoint
(`/api/connectors/chatgpt`) also exists for future automation if OpenAI
ever exposes a live API, or for a script you write yourself.

## The Claude connector

Same constraint, same shape of workaround: Anthropic has no public API
for pulling a user's own Claude conversation history either. Export your
data from claude.ai (Settings → Account → Export data), unzip it, and
upload the `conversations.json` file in Settings → Claude context. A
bearer-token batch endpoint (`/api/connectors/claude`) exists for the
same reason as the ChatGPT one — future automation, or a script you
write yourself.

## Project structure

```
src/app/(app)/          Tasks, People, Calendar, Brief, Settings pages
src/app/api/             All API routes
src/components/          UI, grouped by feature (tasks/people/calendar/brief/settings)
src/lib/                 Core logic: auth, task status rules, priority engine,
                          suggestion detectors, Context Engine, morning brief
                          generation/TTS, daily refresh orchestration
prisma/schema.prisma      Full data model
sync-agent/               Standalone local Obsidian sync agent
```

## What's real vs. what needs a key

Everything in this app is functional against real data with no
mocking — but a few features only become fully alive once you add your
own credentials:

- **Commitment/blocker extraction & AI-composed briefs**: need `ANTHROPIC_API_KEY`. Without it, context is still ingested and stored, and a deterministic rule-based brief/suggestion engine keeps running.
- **Morning brief audio**: needs `TTS_PROVIDER` + an API key. Without it, the brief is text-only with sentence-by-sentence display (no fake "audio player" shown).
- **Obsidian / ChatGPT / Claude sync**: need their respective tokens/exports as described above.

No feature pretends to work when it doesn't — every degraded state says so in the UI.
