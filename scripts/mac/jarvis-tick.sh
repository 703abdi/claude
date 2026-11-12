#!/bin/zsh
# Hits the Jarvis tick on the Personal OS so nudges go out while the app is closed.
# Reads the bearer from ~/.config/personal-os/agents-token. Never prints it.
set -u

SERVER_URL="${SERVER_URL:-https://claude-tau-six.vercel.app}"
TOKEN_FILE="$HOME/.config/personal-os/agents-token"

if [ ! -r "$TOKEN_FILE" ]; then
  echo "jarvis-tick: no token file at $TOKEN_FILE" >&2
  exit 1
fi

# The header goes through stdin (-H @-) so the token never shows in the process list.
status=$(tr -d '\r\n' < "$TOKEN_FILE" | sed 's/^/Authorization: Bearer /' | \
  curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' \
    -H @- "$SERVER_URL/api/cron/tick")

if [ "$status" != "200" ]; then
  echo "jarvis-tick: tick answered $status" >&2
  exit 1
fi
