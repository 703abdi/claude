# Handoff: abdi's os

## Nov 12 2026 (afternoon): v2 follow-through

Abdi said yes to the vault upload and the Mac jobs. Both done and checked:
- Vault upload: `node scripts/memory-sync.mjs` sent 57 batches, 3,803 files, server upserted 3,820 docs, 0 batches
  failed, 0 skipped. Re-run it any time; it only sends changed files. `GET /api/memory/stats` not checked (needs
  his session).
- Mac jobs: `zsh scripts/mac/install.sh` loaded `com.abdi.jarvis-tick` (5 min) and `com.abdi.jarvis-report` (60 s).
  `launchctl list` shows exit 0 for both; logs at `/tmp/com.abdi.jarvis-*.log` are empty (scripts only write on
  failure). Undo with `scripts/mac/uninstall.sh`.

Live AI actions: Abdi signed in on the live site and reported all three worked (add lunch with Ali friday 1pm
then Undo, "what did John and I talk about", tap the orb). That is his report; Claude did not see the screen or
check logs.

Typing boxes restyled (Abdi: "like Claude style, not a double box, not an oval, just a rectangle"): shared
`.type-box` in `globals.css` (12px corners, one 1px border, focus only brightens the border), command bars lost
the pill shape and blue glow, buttons beside a box are `rounded-lg`. Built by Opus agents; Fable read the diff,
looked at Home, Tasks, Calendar and People at desktop and 375 wide (no sideways scroll), and re-ran typecheck,
lint, 88 tests and the build. Settings, Notes, login and the event pop-up were not looked at in the browser.
Abdi's new standing rule (in `~/.claude/CLAUDE.md` habit 4): Fable plans and checks, Opus agents do the work.

Still open, waiting on Abdi (steps given): Google OAuth client + env vars in Vercel, then a
redeploy (needs his yes) and Connect on the Calendar page; allow notifications on his phone.
## Nov 13 2026: Jarvis v2 (SHIPPED: commit 8d3edfa live on claude-tau-six.vercel.app; production branch is `claude/personal-os-dashboard-pv38le`)

Live checks done after deploy: Vercel build Ready, migration ran, `scripts/mac/jarvis-tick.sh` returned 200 against
the live tick. Still NOT checked on live: signed-in pages, the AI tool loop (ask "add lunch with Ali fri 1pm" then
Undo), pushes, Fathom summaries. Abdi has to sign in for those; Claude must not type his password.

Waiting on Abdi's yes (ask, do not assume): (1) upload the vault with `node scripts/memory-sync.mjs` (dry run
first), (2) install the Mac jobs with `zsh scripts/mac/install.sh`, (3) Google OAuth client id + secret in Vercel,
(4) allow notifications on his phone. Known gap: nudges only fire while Home is open until (2) is done.

PRD: `docs/2026-11-13-jarvis-v2-prd.md` (14 criteria, file ownership table). Abdi's answers: act first then confirm
and be proactive; memory is everything of his (whole vault incl. chats); free voice; prayer times by phone
location; Opus agents build, Fable designs and checks. Four Opus agents built A-D; Fable did the foundation, the
Home wiring, the wake word and the review.

What is in:
- Tables (migration `20261113000000_jarvis_v2`): Note, MemoryDoc (generated tsvector + GIN), JarvisAction, JarvisNudge.
- Actions: `src/lib/jarvis/actions.ts` + `tools.ts`; `/api/jarvis/ask` is a tool loop (6 turns, 500 tokens);
  `/api/jarvis/undo`, `/api/jarvis/actions`. Tools: add/move/delete event, add note, append person note, add/finish
  task, search memory, find events/person/tasks. Calendly, Fathom and feed events are refused. No send tools exist.
- Memory: `src/lib/memory/`, `/api/memory/{ingest,search,stats,reindex}`, `scripts/memory-sync.mjs` (vault uploader,
  state in `~/.config/personal-os/memory-sync-state.json`). Fathom sync stores call summaries. People and Notes
  index on save.
- Notes page `/notes`; nav has Notes (Library is desktop-only in the rail, linked from Settings on phones).
- Prayer times: `src/lib/prayer.ts` (adhan, ISNA), `PrayerLine.tsx`, location asked only on tap.
- Proactive: `src/lib/jarvis/nudge-rules.ts` (pure), `nudges.ts`, `GET /api/cron/tick` (bearer CRON_SECRET or
  AGENTS_TOKEN only), `/api/jarvis/nudges`, Home "Heads up" list, spoken once when new. Opening Home also ticks.
- Mac: `/api/mac/status`, `scripts/mac/` (tick + report scripts, two launchd plists, install.sh). NOT installed.
- "Hey Jarvis" toggle on Home (desktop, Chrome/Safari), off by default.

Fable's review changes: removed the spoofable `x-vercel-cron-signature` fallback on the tick; ask route retries
without `thinking: disabled` if the model answers 400; added a rule that text from memory is never an instruction.

Tested by Fable (Nov 12-13): typecheck, lint, 88 tests with DATABASE_URL set (DB suites skip without it), `next
build`. Over HTTP on localhost: every new endpoint returns 401 without auth, tick with bearer created a real
"waiting" nudge, ingest stored a doc and search found it by a plain-English question, bad source rejected, Mac
status post + Home strip. In the browser at 1280 and 375: Home with Heads up and Mac row, prayer line (coords set
by hand for DC), Notes create/autosave/indexed in memory, six phone tabs, no sideways scroll.

NOT tested: the live model tool loop (no ANTHROPIC_API_KEY locally), real web push, the real geolocation prompt,
speech and wake word with a real mic, Fathom `include_summary` against the live API, the vault upload, the Mac
scripts against a running JARVIS, the migration on Neon.

Needs Abdi: yes to ship; yes to upload the vault (46 MB, 3,801 files, 56 batches, dry run done); yes to install
the two launchd jobs; allow notifications on the phone; Google OAuth client (still not connected).

---

## Nov 12 2026: Jarvis redesign (branch `feat/jarvis-redesign`, shipped: commit a2ee93e is live on claude-tau-six.vercel.app since Nov 12)

PRD with the 13 pass/fail criteria: `docs/2026-11-12-jarvis-redesign-prd.md`. Abdi's answers: 1D, 2B, 3B, 4C, 5A.
He also asked for Savee (savee.com) as the UI reference: thin icon rail, near-black, big soft greeting, floating
pill command bar. His Savee account has no saves or boards, so the references came from search results.

What changed:
- Nav: left icon rail on desktop, bottom tab bar on phones, no top bar (`src/components/NavShell.tsx`).
  Calendar and People are their own pages again. Accent is Jarvis blue; the old gold values are in a comment at
  the top of `src/app/globals.css` so it can be switched back in one edit.
- Home (`/hub`): `src/components/jarvis/JarvisHome.tsx`. Particle orb (`orb.ts`, adapted from ethanplusai/jarvis,
  license notice kept in the file: personal non-commercial use only), a briefing rebuilt from the database on every
  load and every 30s (`src/lib/jarvis/briefing.ts` pure + `data.ts` loader, `GET /api/jarvis/brief`), tap the orb to
  hear it (browser speech), a mic and text box that ask `POST /api/jarvis/ask` (Claude, 400 token cap, live rows
  only). Removed from Home: cash, numbers, scoreboard, week goal, Do-now card, today's tasks, agent feed.
- Agents, the 3D Town, Agent Feed and their API routes are deleted. The `Agent`/`AgentRun` tables are still in the
  schema (no migration drops them).
- Calendar: one-line quick add, click a day to add, new event pop-up, connection status row, refreshes every
  minute. Google is two-way in code (`pushEventToGoogle`, `deleteEventFromGoogle` in `src/lib/google.ts`, scope is
  now `calendar.events`). Calendly and Fathom events are locked.
- Fathom (`src/lib/fathom.ts`): no more tasks or inbox posts. Each call attaches its recording link to the matching
  calendar event (same day, closest start, within 90 min) or becomes its own `fathom` event. New column
  `CalendarEvent.recordingUrl` (migration `20261112000000_event_recording_url`).
- Pull throttles: Google 3 min, Calendly 3 min, Fathom 5 min (were 15/15/30).
- People: list on the left, one person on the right with autosaving notes, upcoming and past meetings, open items.
- Tasks: one list (Today, Next, Later, Waiting), one-line add, a banner that removes the old tasks made from calls.

Tested (by me, Nov 12): `npm run typecheck`, `npm run lint`, `npm test` (36 pass, includes briefing, call matching,
Google event body), `next build`. Clicked through Home, Calendar (quick add made an event and Home showed it on
the next load), People, Tasks, Settings, Library at 1280 and 375 wide: no sideways scroll.

NOT tested: `/api/jarvis/ask` with a real key (local has none; it returned the "key isn't set" message), speech in
and out (needs a real mic and speakers), Google two-way (Google is not set up on Vercel at all: no
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), Fathom and Calendly pulls against the live APIs, the migration on Neon.

Known gaps:
- If Fathom pulls a call before Google has pulled its event, the call becomes its own event and the Google one
  shows next to it. No merge yet.
- `src/app/globals.css` still has dead `.town-*`, `.agent-*`, `.do-now` rules.
- Local dev login: user `me@test.dev`, password in `.env.local` as `LOCAL_TEST_PASSWORD` (local Postgres only).
  Dev server: `DATABASE_URL=postgresql://app:app@localhost:5432/pos AUTH_SECRET=local-dev-secret-local-dev-secret-1234 npx next dev -p 3010`.

Jarvis on the Mac: cloned to `~/Projects/jarvis` (ethanplusai/jarvis @ 16e37bd), venv on Python 3.14, deps,
Playwright Chromium, certs and frontend installed, `USER_NAME=Abdi` in its `.env`. Server boots and answers.
`start-jarvis.command` in that folder starts both halves and opens Chrome. It has no voice until `FISH_API_KEY` is
in `~/Projects/jarvis/.env` (Fish Audio, paid; Abdi has not approved it). It also wants Screen Recording permission
for whatever app launches it. It is not connected to this dashboard yet.

Needs Abdi: (1) yes to commit and push so Vercel builds a preview, (2) Google OAuth client id + secret in Vercel,
then Connect Google on the Calendar page, (3) decide on a Fish Audio key for Mac Jarvis, (4) click "Remove them"
on Tasks to clear the old call-made tasks.

---

## Where things stand

**Live site:** https://claude-tau-six.vercel.app. Vercel production deploys
from the branch `claude/personal-os-dashboard-pv38le`
([PR #1](https://github.com/703abdi/claude/pull/1)). Everything through
`07e68da` is deployed and Ready.

**Repo:** `703abdi/claude`. Abdi is switching it to **private** by hand
(Settings → Danger Zone). No secrets were ever committed.

## Done this session

- **Agents.** API keys can no longer be typed into the model box, and
  agents can be removed from the Hub or the Town. Failed runs show their
  error in red. The run route has `maxDuration = 60`, answers are capped
  at 1500 tokens, and errors read like "rejected the key" or "isn't set".
  Cloud runs stuck for over 3 minutes are marked failed; local agents
  are left alone.
- **Build fix.** `scripts/migrate-deploy.mjs` runs migrations over Neon's
  direct host with Prisma's advisory lock off. An earlier build had leaked
  that lock through the pooler, which blocked every deploy (`P1002`).
- **Friend template.** Built at `/home/user/personal-os-template`, which
  has a fresh git history and is not pushed. Details below.

## Next up: make the dashboard actually usable

Abdi's latest request (2026-11-08): "lets make this dashboard actually
usable". Not started yet; only screenshots of Hub, Tasks, Calendar and
People (desktop + phone) were being taken to audit it. The likely
reading: the Hub is a showpiece (hero, orbit, ticker, 3D town) and the
daily basics are buried. Aim for a daily driver: quick-add a task from
the Hub, today's list with one-click complete, what's next on the
calendar, who's waiting on you, fast on a phone. Audit first, then fix
the biggest friction, and say which reading was taken.


## Nov 8 2026: Hub rebuilt (three rounds)

**Round 1, daily driver.** Quick add with natural language
(`#area @person !high tomorrow 3pm >today`, parser in
`src/lib/quick-add-parse.ts`), Today list (one tap completes, Undo toast),
Up next, Waiting on (Nudge), This week (3 outcomes, scoreboard, cash ring
to $20k by Dec 31), numbers strip, Agent feed, lazy Town. Data comes from
`GET /api/hub` via `src/lib/useHub.ts` (polls 8s while visible, refetches
on focus, optimistic mutations). Agent API for Grok, Codex, Claude Code and
Jarvis: `POST /api/inbox`, `GET /api/state`, bearer `AGENTS_TOKEN`
(`docs/agent-api.md`). Migration `20261108044545_agency_week_inbox`
(additive): Task.source, WeekPlan, ScoreEntry, Goal, InboxItem. Goal and
the current WeekPlan are created on first Hub load if missing.

**Round 2, redesign.** Near-black, one gold accent (`--accent #e6b450`),
Inter 800 headlines, hairline cards, no glass or neon. Tokens and
component classes (`.card`, `.tile`, `.eyebrow`, `.btn-primary`,
`.btn-ghost`, `.glow-accent`) live in `src/app/globals.css`; legacy
color names map onto the new tokens so every page recolored. Desktop Hub:
12-col grid, Today left (7), This week / Up next / Waiting / Brief right
(5, sticky). Calendar has an Agenda view (default on phone). People sorts
whoever owes you first.

**Round 3, launcher.** The Hub opens as a home screen
(`src/components/hub/HomeScreen.tsx`): full-bleed photo from
`public/backgrounds/` (Madinah night default, DC dusk, or none; picker
bottom-left, saved in localStorage `pos.backdrop`), greeting with a
reactive one-liner, a command bar (`src/lib/command-parse.ts`: plain
text = task, `5 dials` / `cash 500` = scoreboard, `note for jarvis: ...`
= agent feed, `/calendar` = navigate, `find x` = Tasks palette), and six
tiles that scroll to the dashboard sections below (`#today`, `#week`,
`#upnext`, `#waiting`, `#feed`, `#town`). `/backgrounds/` is public in
`src/proxy.ts` so the image optimizer can fetch it; `next.config.ts`
allows quality 80.

**Round 4, concise.** One input only: the home command bar (the dashboard
quick add is gone; a floating "+" on desktop and the center "+" in the
phone nav jump back to it). Today rows show title plus one line (due or
person). Nav is Hub and Tasks; Calendar, People and the Town are reached
from their Hub cards and the Town tile. Metrics is off the nav (route
still exists). Tasks page header: big headline, progress ring, three
inline stats; rows lift gold on hover.

**Round 5, all in one.** Abdi: "just have it all in one". The Hub holds
every section: Today, Calendar (the full month/agenda, `HubCalendar`),
People (`HubPeople`), This week, Agents, Town. Jump pills sit at the top
of the home screen and stick under the top bar once you scroll
(`SECTIONS` in `HomeScreen.tsx`). The clock is gone; the date stays. Nav
is Hub, Tasks, Calendar (`/hub#calendar`), People (`/hub#people`).
Autonomy: calendar feeds. Paste a Google Calendar secret iCal URL (or
Calendly, any ICS) in Settings; `src/lib/calendar-feeds.ts` fetches it
server side (node-ical, 5 min cache, recurring events expanded for a 7
day back / 45 day forward window) and the events appear read-only in Up
next, the Hub calendar and `/api/calendar-events?feeds=1`. Stored in
SyncSource type CALENDAR name "ics".

**Round 6, usability and Fathom.** Home screen is now four things: a
"Do this now" card (`src/lib/next-action.ts`: late task, call within 45
min, agent question, person owed a nudge, dials behind pace on a
weekday after 10am, top pinned task, else an outcome), the scoreboard
with + buttons, today's top three, then the command bar. Tiles, the
numbers strip, the Up next and Waiting cards, the Town section and the
agents row are gone from the Hub (agents and connectors live in
Settings; Town is a pill to /town). Fathom: set `FATHOM_API_KEY`
(Fathom Settings -> API). `src/lib/fathom.ts` pulls recorded calls
(30 min throttle via SyncSource MANUAL/"fathom", also forced in the daily
refresh and from Settings -> Sync now). Each call becomes an agent feed
item with its link; action items assigned to Abdi (or unassigned) become
pinned tasks with source `fathom:<recording>:<n>`; items assigned to a
known Person become WAITING tasks on that person. Not tested against a
real Fathom key yet.

**Round 7, zero-key batch (see INTEGRATIONS_PLAN.md).** `src/lib/sources.ts`
is the registry of every source (built or planned, env names, what it
gives); Settings -> Sources renders it with connected / not set / not
built, setup steps and Sync now. Zapier: `POST /api/hooks/zapier?key=`
(key derived from AUTH_SECRET, shown in Settings) makes feed items or
tasks from loose JSON. Fathom now creates People from external invitees
and assignees. `src/lib/next-action.ts` flags tasks whose title names a
past date as stale (Drop button). `src/lib/digests.ts`: morning digest
(rides the 11:00 UTC daily refresh), evening digest and Sunday scorecard
(`/api/cron/evening`, 01:00 UTC daily; weekly drafts next week's three
into WeekPlan). Digests always post to the feed as agent "os"; they email
only when RESEND_API_KEY and DIGEST_TO are set. Demo seed rows were
cleared from production via `POST /api/admin/clear-seed`.

Known follow-ups: swipe to complete and press-and-hold on the counters
were only exercised with mouse clicks; the backdrop picker is not in the
phone account menu (it sits bottom-left of the home screen on all sizes);
the morning brief still needs ANTHROPIC_API_KEY in Vercel to generate.

## Open items for Abdi

1. **Is a1 working?** `NVIDIA_API_KEY` is set in Vercel (production
   only). Remove a1, add a new NVIDIA agent with a blank model, and send
   it "say hi". If it goes blocked, the red error text says why. The old
   key that was pasted into the model box should be revoked at
   build.nvidia.com.
2. **Publish the template.** Abdi creates an empty **public** repo named
   `personal-os-template` at https://github.com/new, with no README. The
   GitHub connection here can't create repos (403). Then:
   `mcp__Claude_Code_Remote__add_repo` (access: push), push `main` from
   the template folder, and have Abdi tick **Settings → Template
   repository**.
3. **abdiform metrics.** The `metrics-api` branch in `703abdi/abdiform`
   isn't merged. To connect it: set `METRICS_TOKEN` there, and
   `ABDIFORM_URL` + `ABDIFORM_METRICS_TOKEN` in this app's Vercel.
4. **Later phases Abdi mentioned:** Content OS, Google Calendar and other
   connectors, futuristic redesign of the Tasks/People/Calendar pages.

## The template must not be lost

The container is temporary. The template is also packed as a single
file: `personal-os-template.bundle`, committed to this branch. To
restore it in a new session:

```bash
git clone personal-os-template.bundle personal-os-template
```

If the bundle is gone too, rebuild it from this repo:

1. `git archive` this repo, minus `tawakkul-site/`.
2. Remove everything personal: "abdi" becomes `OWNER_NAME` / `src/lib/brand.ts`,
   abdiform becomes the generic metrics source (`METRICS_SOURCE_*`), and
   the seed data gets generic businesses.
3. Add the extras: `src/lib/database-url.ts` (Supabase support),
   first-login account creation in `src/app/api/auth/login/route.ts`,
   `scripts/setup.mjs`, `local-agent/`, `docs/metrics-source.md`,
   `CLAUDE.md`, and `.claude/skills/setup-os/SKILL.md`.

What's in it: a Deploy-with-Vercel button (asks for the Supabase
`DATABASE_URL`/`DIRECT_URL`, `AUTH_SECRET`, admin login and OS name),
`npm run setup`, the `/setup-os` Claude Code skill, and a local agent
that runs `claude -p`. A fresh install was tested end to end against a
new Postgres database: setup, first sign-in, branding, a local agent run,
and every page loading with no personal strings. The Deploy button and
Supabase itself are untested.

## Nov 9 2026: phone fixes and unit tests

- /tasks no longer scrolls sideways at 390px. The cause was the StatHeader glow (`.glow-accent::before`, inset -10%), not the view chip row, which already scrolls on its own; the content column gets `max-lg:overflow-x-clip`. Hub phone tap targets (logo, search, `next`, `see list`, scoreboard labels) reach 40px through padding plus a matching negative margin, so layout and desktop are unchanged. `npm test` runs node:test over quick-add-parse, command-parse and next-action (22 tests, under 1s); `npm run typecheck` runs tsc.

## Gotchas

- A parallel session pushes `tawakkul-site/` to the same branch. Always
  `git fetch` + `git merge --no-edit` before pushing. Never rebase or force.
- Local testing: `service postgresql start`, DB
  `postgresql://app:app@localhost:5432/pos`, user `me@test.dev` /
  `pw-12345678`. Start the dev server with `DATABASE_URL` and `AUTH_SECRET`
  set inline, since there's no `.env`.
- Vercel's free plan keeps runtime logs for 1 hour only.
- Read `node_modules/next/dist/docs` before Next.js changes (see AGENTS.md).

---

## Nov 13 2026: Library rework requested (not started)

Abdi (voice note): the Library page is useless to him as a flat list of SOPs. He wants subject boxes (content,
ads, Claude optimization, and so on) that open up, an "add new" option, and for each SOP a plain explanation of
where it came from and what it does, with visuals where possible. Drill-down example he gave: Content -> School of
Hard Knocks -> every topic learned from it -> Instagram videos -> everything he has on that (tips, where they came
from, scrapes, info), organized and visual. Moved to its own session because the previous one passed 500k
tokens. That session starts with lettered questions (habit 3) before building.

## Nov 12-13 2026: Library rework shipped (commit 404116f, live)

PRD: `docs/2026-11-13-library-rework-prd.md`. Abdi's answers: 7 subject boxes, SOPs + research + methods +
Nightshift + Grok reports + relevant chats, sources as they really exist (he adds School of Hard Knocks through
Add new), explanations written once by Claude agents, Add new = paste text or a link.

What exists now:
- `/library` (search box "What are you looking for?", 7 subject boxes, Add new), `/library/browse/[subject]`,
  `/[source]`, `/[topic]`, `/library/[slug]` (What this is / Where it came from / What it does, numbered steps,
  Human / AI / Client tabs), `/library/new`. Code: `src/lib/library.ts`, `src/components/library/`,
  `src/app/(app)/library/**`, `src/app/api/library/route.ts` and `new/route.ts`.
- `LibraryDoc` has new nullable columns (subject, source, topic, kind, summary, origin, purpose, steps, variants,
  url, addedBy). Migration `20261113120000_library_rework` is additive and applied locally and in production.
- The explanations live in the vault at `_scripts/library/meta/*.json` (11 files, 440 entries, 20 marked skip).
  `scripts/sync-library.sh [app-url]` (calls `sync-library.py`) reads them plus the `SOPs/` folder and posts in
  batches. `LIBRARY_DRY_RUN=1` prints without posting. Rows added in the app (`addedBy = manual`) are never
  deleted or overwritten by the sync. The sync deletes every other row that is no longer in the vault set.
- Local DB after sync: 420 docs, all with subject + summary + origin + purpose, 194 chats, 78 agency SOP codes
  each once, the 18 old `SOPs/` slugs unchanged.

Checked by Fable: typecheck, lint (0 errors), `npm test`, `next build`; click-through on localhost:3010 of the
subject -> source -> topic -> item path, search, an agency SOP with tabs, an old SOP link, Add new end to end; no
sideways scroll at 375px on 9 library pages.

Shipped on Abdi's yes (Nov 12): committed, pushed, deployed, migration ran on deploy, and
`scripts/sync-library.sh` loaded 420 docs into production. Checked live: /library, the School of Hard Knocks
path and an old SOP link.

Gotchas:
- A dev server started before a migration keeps the old Prisma client and returns 500 on `/api/library`. Restart it.
- The local dev server reads `AGENTS_TOKEN` from `.env.local`, which differs from `~/.config/personal-os/agents-token`
  (the production one). For a local sync, call `sync-library.py` with a temp token file holding the `.env.local` value.
- Chat docs contain whatever was pasted into the chat (call transcripts with prospect names). The Library is behind
  login, same as the rest of the app.
- "Skool of Content" (1 chat) and "School of Hard Knocks" (1 chat) show as two sources; they look like the same
  program. Merge by editing `source` in the meta JSON if Abdi confirms.
- New material: add it in the app, or add an entry to a meta JSON and re-run the sync. There is no in-app AI
  writing yet (Anthropic key invalid until about Nov 14).

## Nov 12 2026: Library v2 content pass (built, local only until Abdi says ship)

Abdi after using the live Library: "too many words, not clear enough instruction, no visuals or example links",
"I don't like the full note system", split big topics, hint on the steps line, merge Skool of Content.
Spec: the "V2 content pass" and "Full note reader" sections at the end of `docs/2026-11-13-library-rework-prd.md`.

- Every meta entry now also has `tldr`, `useWhen`, `from`, command-style `steps`, `example` (copied word for word
  from the note), `links` (only URLs in the note), `related`, and `visual` (flow, formula, twocol, funnel, numbers).
  Checker: `scripts/check-library-meta.py <meta files>`.
  421 entries, 0 problems, 419 with an example, 292 with links or related.
- `groups.json` in the meta folder maps sourcePath -> group label for the 11 topics with more than 6 items
  (138 items, max 6 per group). If items are added to a big topic, re-run a grouping pass.
- App: migration `20261113180000_library_v2` (additive), `ItemSummary`, `Visual`, `StepsLine`, `Reader` components,
  `src/lib/note-sections.ts` (splits a note by headings, a chat by "You:" turns). `VariantTabs` is gone.
- "Skool of Content" merged into "School of Hard Knocks" (3 items there now, including the Sep 2 course chat).
- Checked by Fable locally: typecheck, lint, 109 tests, build; grouped topic page, pop-up for several visual types,
  CON-02 and a chat in the reader, no sideways scroll at 375px on 6 pages, no console errors.
- To ship: commit, push (migration runs on deploy), then `scripts/sync-library.sh` against production.
