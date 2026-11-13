# Jarvis v2 (Nov 13, 2026)

Abdi's answers: Jarvis does the thing, then confirms what it did, and it is proactive. Memory is everything that is
his (whole Obsidian vault including chats, Fathom calls, People notes, Notes). Free browser voice. Prayer times from
the phone's location. Opus agents build; Fable designs, delegates and checks.

Branch `feat/jarvis-v2`. Foundation already in: migration `20261113000000_jarvis_v2` (Note, MemoryDoc with a
generated `tsv` column and GIN index, JarvisAction, JarvisNudge) and contract stubs `src/lib/memory/index.ts`,
`src/lib/notes.ts`.

## Who builds what (files do not overlap)

| Piece | Owner | Files |
|---|---|---|
| A. Actions | Opus agent | `src/lib/jarvis/tools.ts`, `src/lib/jarvis/actions.ts`, `src/app/api/jarvis/ask/route.ts`, `src/app/api/jarvis/undo/route.ts`, `src/app/api/jarvis/actions/route.ts`, tests |
| B. Memory | Opus agent | `src/lib/memory/**`, `src/app/api/memory/**`, `src/lib/fathom.ts`, `scripts/memory-sync.mjs`, tests |
| C. Notes and prayer times | Opus agent | `src/lib/notes.ts`, `src/app/api/notes/**`, `src/app/(app)/notes/**`, `src/components/notes/**`, `src/components/NavShell.tsx`, `src/lib/prayer.ts`, `src/components/jarvis/PrayerLine.tsx`, `package.json` (adhan only), tests |
| D. Proactive | Opus agent | `src/lib/jarvis/nudges.ts`, `src/lib/jarvis/nudge-rules.ts`, `src/app/api/cron/tick/route.ts`, `src/app/api/jarvis/nudges/**`, `src/app/api/mac/status/route.ts`, `src/proxy.ts`, `scripts/mac/**`, `.github/workflows/jarvis-tick.yml`, tests |
| Home wiring, wake word, review | Fable | `src/components/jarvis/JarvisHome.tsx`, `src/components/jarvis/voice.ts`, `src/app/globals.css`, `HANDOFF.md` |

## Acceptance criteria (pass or fail)

1. "add lunch with Omar friday 1pm" in the ask bar creates the event, the reply says what was done, and an Undo
   button removes it. Same for: move or delete an event, add a note, add to a person's notes, add or finish a task.
2. Every action is a row in JarvisAction. Undo restores the previous state exactly and marks `undoneAt`. A second
   undo of the same row is refused.
3. Jarvis never changes a Calendly or Fathom event, and never sends email or messages. A test proves the lock.
4. `searchMemory("...")` returns ranked chunks with a snippet from MemoryDoc using Postgres full-text search. Tested
   against the local database.
5. `scripts/memory-sync.mjs --dry-run` lists what it would upload from the vault and the total size without sending
   anything. Without `--dry-run` it uploads changed files only (hash state file), in batches under 1 MB.
6. Fathom sync stores each call's summary in memory (source "fathom") with the share link.
7. Jarvis answers "what did X and I talk about" from memory and names the source. With nothing found it says so.
8. `/notes`: list left, editor right, autosave, pin, delete with confirm, search. Notes are in memory within one save.
9. Prayer times: after one location prompt, Home shows the next prayer and its time; computed on the device with
   the `adhan` library; a unit test checks known times for a fixed place and date. Denied location shows nothing.
10. `GET /api/cron/tick` (bearer CRON_SECRET or AGENTS_TOKEN) creates each nudge once: pre-call brief 15 minutes
    before a timed event (who, notes on them, last call), morning briefing at the user's set time, someone owing
    him for 3+ days, a new recorded call, tomorrow's first event at 8pm. Rules are pure and tested.
11. New nudges are pushed (web push) and listed by `GET /api/jarvis/nudges`; dismiss works. Home shows them on top.
12. `POST /api/mac/status` (bearer AGENTS_TOKEN) stores Claude Code session states from the Mac; Home shows a strip
    when the last report is under 3 minutes old and hides it otherwise.
13. "Hey Jarvis" toggle on Home: when on, the mic stays open and a sentence starting with "Jarvis" is sent as a
    question. Off by default. Hidden where the browser can't listen.
14. `npm run typecheck`, `npm run lint`, `npm test`, `next build` pass. Home, Notes and the ask flow are clicked
    through at desktop and 375px.

## Non-goals

- Personal finance. Paid voices. Sending email, texts or DMs. Editing the vault from the dashboard.
- AI embeddings or a vector database (full-text search first; revisit only if answers are poor).
- Installing anything on the Mac or pushing or deploying without Abdi's yes.
