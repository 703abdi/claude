# Agent API

How Grok, Codex, Claude Code and Jarvis write into abdi's os and read today's state.

## The token

Every call sends `Authorization: Bearer <AGENTS_TOKEN>`. It is the same shared secret
local agents already use for `/api/agents/local/*`.

- Make one: `openssl rand -hex 32`
- Set it in Vercel: Project -> Settings -> Environment Variables -> `AGENTS_TOKEN`, then redeploy.
- Give it to each agent as an env var or secret. Never paste it into a prompt or a repo.
- No token set = both endpoints answer 401.

Base URL below is `$OS` (your Vercel domain, or `http://localhost:3010` in dev).

## POST /api/inbox

Drop something into the Hub's agent feed.

| field | type | notes |
|---|---|---|
| `agent` | string, required | `grok`, `codex`, `claude`, `jarvis`, or any name. Lowercased. |
| `kind` | required | `task`, `note`, `update` or `question` |
| `title` | string, required | max 300 chars |
| `body` | string | shown as 2 lines in the feed |
| `link` | http(s) URL | |
| `due` | ISO date | `2026-11-12` (that day) or a full timestamp. Tasks only. |
| `person` | string | matched to an existing person by name or first name. Tasks only. |
| `pinToday` | boolean | default `true`. Tasks only. |
| `counters` | object | optional scoreboard totals for the day: `dials`, `convos` (or `conversations`), `booked`. Sets, does not add. |
| `cash` | number | cash collected that day, in dollars. Sets the day's cash. |
| `day` | `YYYY-MM-DD` | which local day `counters` and `cash` belong to. Default today. |

`kind: "task"` also creates a real task (pinned to Today unless `pinToday: false`,
`source` = `agent:<agent>`). Other kinds only create the feed item. Abdi can turn any
item into a task or dismiss it from the Hub.

Returns `201` with `{ item, task, personMatched, score }`. `score` is the day's scoreboard
after the write, or `null` when no counters were sent. Unknown fields (`key`, `externalId`)
are ignored.

## POST /api/score

The Hub scoreboard on its own, same bearer token. `{ date?, field, delta }` adds to one
counter (`dials`, `convos`, `booked`, `cashCents`); `{ date?, values: {...} }` sets them.
`date` is a local `YYYY-MM-DD`, default today. Returns the day's numbers.

## GET /api/state

Compact JSON of today, made for an LLM to read before it talks to Abdi:
`today`, `overdue`, `waitingOn`, `upNext48h`, `week.outcomes`, `scoreboard` (today and week,
cash in dollars), `goal` (collected, target, percent, days left), `stats`, `inboxUnresolved`.
Optional `?tz=America/New_York` (defaults to the timezone in Settings).

## Examples

Grok or Codex, from a shell or a tool step:

```sh
curl -X POST "$OS/api/inbox" \
  -H "Authorization: Bearer $AGENTS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent":"grok","kind":"task","title":"Call Lavender about pilot price","due":"2026-11-10","person":"Lavender"}'

curl -X POST "$OS/api/inbox" \
  -H "Authorization: Bearer $AGENTS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent":"codex","kind":"update","title":"Clear Line booking page deployed","link":"https://example.com/pr/42"}'

curl "$OS/api/state" -H "Authorization: Bearer $AGENTS_TOKEN"
```

Jarvis (Claude API tool handlers, Node 18+):

```js
const OS = process.env.OS_URL;
const auth = { Authorization: `Bearer ${process.env.AGENTS_TOKEN}` };

export async function getState() {
  const res = await fetch(`${OS}/api/state`, { headers: auth });
  return res.json(); // pass this to the model as the tool result
}

export async function addToInbox(input) {
  const res = await fetch(`${OS}/api/inbox`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "jarvis", ...input }),
  });
  return res.json();
}
```

Paragraph for an agent's system prompt:

> You can read and write Abdi's OS. Before you answer, call GET /api/state to see today's
> tasks, who he is waiting on, his calendar, this week's 3 outcomes and the cash goal. When
> you find something he must do, POST /api/inbox with kind "task", a short verb-first title,
> and a due date if there is one. Use kind "note" or "update" for information and "question"
> when you need his answer. One item per thing, no duplicates, never put secrets in the body.

## Errors

- `401` token missing or wrong
- `400` body failed validation (the response says which field)
