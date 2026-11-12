# Jarvis on the Mac

Two small jobs that keep Jarvis proactive while the app is closed. Nothing here is installed yet.

Files:

- `jarvis-tick.sh` calls `/api/cron/tick` on the live site. The tick pulls Fathom, Calendly and
  Google, works out which nudges are due (pre-call, morning, waiting, new call, tomorrow) and
  pushes each new one to your phone once. Uses the token in `~/.config/personal-os/agents-token`
  and never prints it. Set `SERVER_URL` to point it somewhere else.
- `mac-report.mjs` asks the local JARVIS server (`GET https://127.0.0.1:8340/api/sessions`) which
  Claude Code sessions are running, waiting on you or idle, and posts that list to
  `/api/mac/status`. Home shows the strip while the last report is under 3 minutes old. If JARVIS
  is off it posts an empty list. `node mac-report.mjs --dry-run` prints the payload and sends nothing.
- `com.abdi.jarvis-tick.plist` runs the tick every 5 minutes.
- `com.abdi.jarvis-report.plist` runs the report every minute.
- `install.sh` copies both plists into `~/Library/LaunchAgents` and loads them.
- `uninstall.sh` stops them and removes the plists.

Logs go to `/tmp/com.abdi.jarvis-tick.log` and `/tmp/com.abdi.jarvis-report.log`.

To turn it on: `zsh scripts/mac/install.sh`. To turn it off: `zsh scripts/mac/uninstall.sh`.

The plists use `/opt/homebrew/bin/node`. If `which node` prints something else, fix that path first.

## When the Mac is asleep

`scripts/github/jarvis-tick.yml` is a GitHub Actions workflow that runs the same tick every
5 minutes. It sits outside `.github` so it does nothing yet. To turn it on:

1. In the GitHub repo, add a secret named `JARVIS_TICK_TOKEN` with the AGENTS_TOKEN value.
2. Copy the file to `.github/workflows/jarvis-tick.yml`, commit and push.

Running both is fine: each nudge has a unique key, so it is only sent once.
