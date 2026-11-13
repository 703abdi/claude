# Jarvis redesign (Nov 12, 2026)

Abdi's answers: 1D (Jarvis look and voice in the browser, plus the ethanplusai Jarvis on the Mac), 2B (Home is a
Jarvis briefing rebuilt from live data on every open), 3B (Calendar with Google, Calendly and Fathom), 4C (keep Tasks
and People, clean them up), 5A (delete Agents and the 3D Town).

His complaints this fixes: Home shows stale things (a call from days ago, tasks he already delegated), today's
numbers and cash duplicate the agency dashboard, the double box at the bottom is ugly, top bars instead of a
sidebar, Calendar is hard to add to and has no connections, People is cluttered, Calendar and People are not their
own pages.

## Acceptance criteria (each pass or fail)

1. Desktop has a left sidebar with Home, Calendar, People, Tasks, Library, Settings. No top bar on any page.
   Phones get a bottom tab bar and no top bar.
2. Calendar and People are their own pages (`/calendar`, `/people`). No nav item points at `/hub#...`.
3. Home has: the particle orb, a briefing built at request time from the database, and a text box to ask Jarvis.
   Home does not show cash, today's numbers, the scoreboard, "today left", the week goal, the Do-now card or the
   agent feed.
4. The briefing only mentions events from now on (today and the next 7 days), calls from the last 48 hours, and
   waiting-on people. A test proves an event from 2 days ago is not in it.
5. Tapping the orb reads the briefing out loud (browser speech, no paid voice). The mic button turns speech into a
   question; the answer is shown and spoken.
6. `/api/jarvis/ask` answers from live data with Claude (the key already on Vercel), capped at 400 output tokens,
   and refuses with a plain message when the key is missing.
7. Agents, Town, AgentFeed and their API routes are gone. `three` stays only for the orb.
8. Fathom calls no longer create tasks. Each call attaches to the matching calendar event (same day, closest start
   time, within 90 minutes) with its share link and summary, or becomes its own read-only event.
9. Calendar: a one-line quick add ("Lunch with Ali fri 1pm") creates an event. Clicking an empty day opens the add
   form on that day. The right-hand panel is gone.
10. Google Calendar is two-way when connected: an event made or edited here is written to Google, and Google events
    can be edited here. Calendly and Fathom events stay read-only.
11. People: list on the left, the chosen person on the right with notes, upcoming and past meetings (with Fathom
    links) and open tasks. No AI suggestion boxes.
12. Tasks: one list grouped Today, Next, Later, Waiting. No right sidebar, no suggestion banner.
13. `npm run typecheck`, `npm test`, `npm run lint` and `npm run build` pass. Every page loads in the browser at
    desktop and 390px width with no sideways scroll.

## Non-goals

- Personal finance page (Abdi: "I'll worry about that build later").
- Hosting the ethanplusai Jarvis online. It runs on the Mac only; the dashboard links to it.
- A paid voice (Fish Audio, ElevenLabs). Browser speech only, until Abdi adds a key.
- Changing the background images.
- Pushing or deploying. That waits for Abdi's yes.
