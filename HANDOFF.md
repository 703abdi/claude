# Handoff: abdi's os

## Where things stand

**Live site:** https://claude-tau-six.vercel.app. Vercel production deploys
from the branch `claude/personal-os-dashboard-pv38le`
([PR #1](https://github.com/703abdi/claude/pull/1)). The latest commit,
`8cd48fd`, is deployed and Ready.

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
file: `personal-os-template.bundle` in this folder (not committed). To
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

## Gotchas

- A parallel session pushes `tawakkul-site/` to the same branch. Always
  `git fetch` + `git merge --no-edit` before pushing. Never rebase or force.
- Local testing: `service postgresql start`, DB
  `postgresql://app:app@localhost:5432/pos`, user `me@test.dev` /
  `pw-12345678`. Start the dev server with `DATABASE_URL` and `AUTH_SECRET`
  set inline, since there's no `.env`.
- Vercel's free plan keeps runtime logs for 1 hour only.
- Read `node_modules/next/dist/docs` before Next.js changes (see AGENTS.md).
