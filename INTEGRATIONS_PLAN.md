# Integrations plan: make the OS fill itself

Goal: Abdi opens the Hub and it already knows his day. He types nothing. Every
source below feeds one of four places on the home screen: the Do-this-now card,
the scoreboard, Today, or the agent feed. Nothing gets a page of its own.

How every source works (same pattern as Fathom, already built):
- A pull function in `src/lib/<source>.ts`, throttled with a `SyncSource` row.
- Runs on each Hub load (throttled), on the daily refresh, and from a
  Sync now button in Settings.
- Writes tasks with `source: "<source>:<id>"` so re-runs never duplicate,
  feed items with a link back, and people when a new name shows up.
- Keys live in Vercel env vars. Settings shows connected / not set and the
  last pull. The key is never shown.

## Phase 1: pipeline and inbox (first batch)

| Source | What shows up | Needs from Abdi |
|---|---|---|
| Gmail | Threads waiting on your reply become owed items with age ("Reply to Lavender, 2 days"). Do-this-now can pick them. Reply straight from the Hub. | Google sign-in once (OAuth). Same sign-in covers Calendar below. |
| Google Calendar (API) | Replaces the iCal paste. Events with attendees, links, and who you meet next. Calendly bookings included since they land on this calendar. | Same Google sign-in. |
| Calendly | Built. Every booking lands on the calendar with the invitee as a person, adds one to booked on the day it was booked, posts to the feed. Cancellations remove the event and post. | `CALENDLY_TOKEN`. |

Build order inside the batch: Calendly (done), then Google (one sign-in unlocks two).
Close and Typeform dropped: Abdi no longer uses them.

## Phase 2: money and audience

| Source | What shows up | Needs |
|---|---|---|
| Whop | New members, failed payments, churn, revenue this week. Cash collected flows into the $20k ring automatically. | Whop API key. |
| Stripe (if any cash runs through it) | Same as Whop for payouts. | Stripe restricted key, read-only. |
| GoHighLevel | Pipeline stage changes and lead SMS replies in the feed. | GHL API key. |
| Zapier | Anything already routed through Zapier posts into the OS. | Nothing. I hand over a webhook URL. |
| Instagram (Tawakkul) | Followers, reach, saves on the last post, DMs from the last 24h, one line a day: post or don't. | Meta login once, or keep using the IG export. |
| Chase | No API without a bank aggregator and I won't handle bank logins. Fallback: monthly statement PDF upload in Settings, read for balance and large movements. | A PDF a month, or skip. |

## Phase 3: the OS reaches you

| Push | What it does | Needs |
|---|---|---|
| Morning text, 7am | The Do-this-now line, your three, and any call before noon, as an SMS. | Twilio key, or send as email to your phone with no key. |
| Evening close, 9pm | One text: "Dials? Convos? Booked? Cash?" Reply with four numbers, scoreboard fills in. | Same. |
| Weekly scorecard, Sunday 9pm | Outcomes hit or missed, cash gap to Dec 31, next week's three drafted for you to edit. | Nothing. |
| Nudge reminders | When someone has owed you 3 days, the OS drafts the nudge and asks "send?". | Gmail from Phase 1. |

## Phase 4: the brain

| Piece | What it does | Needs |
|---|---|---|
| Nightly Claude pass | Reads every source, writes the next day's Do-this-now ranking with a one-line why, merges duplicate tasks (Fathom says "text Lavender", Calendly booked Lavender), and files new people. | ANTHROPIC_API_KEY (set) plus CRON_SECRET (set). |
| People auto-create | Any name from a call, email, booking or CRM lead becomes a Person with their last touch and what they owe you. | Nothing. |
| Grok and Codex loops | Agents post findings into the feed on a schedule, read `/api/state` for context. | AGENTS_TOKEN. |
| Morning brief with voice | Already built. Needs the TTS provider key to speak. | ELEVENLABS or OPENAI key already set; TTS_PROVIDER set. Test. |

## Keys to set, one sitting

In Vercel, project claude, Settings, Environment Variables, tick Production,
then Redeploy once at the end. Exact names:

- `CALENDLY_TOKEN`
- `WHOP_API_KEY`
- `GHL_API_KEY`
- `AGENTS_TOKEN` (any long random string, also goes into the agents' configs)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `ABDI_PHONE` (only if you want texts)

Google is different: it is a sign-in, not a key. I add a "Connect Google"
button in Settings and you click it once. That needs `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`, which I'll walk you through in Google Cloud (five
minutes, one time).

## What I can build with zero keys, now

1. The source framework and Settings cards for every row above, so each
   key you add lights something up with no further code.
2. Zapier webhook endpoint.
3. People auto-create from Fathom calls (Lavender, Joaquin, Mohammed should
   already be People).
4. Do-this-now v2: dedupe, owed-to-you from any source, stale task detection
   (the two Oct 30 Mohammed items would be flagged, not shown as live).
5. Weekly scorecard and the Sunday draft of next week's three.
6. Morning and evening messages by email (SMS later with Twilio).

## Order of work

1. Zero-key batch above (one session).
2. Google sign-in, Gmail, Calendar API (one session, needs the two Google values).
3. Calendly: built, needs CALENDLY_TOKEN.
4. Whop, GHL, Instagram (one session).
5. Twilio texts and the nightly Claude pass (one session).

Each session ends with a live deploy and a Settings page that shows what is
connected. Abdi's part per session: paste the keys for that batch.
