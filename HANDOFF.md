# Handoff: abdi's os

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
