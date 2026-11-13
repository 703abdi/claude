#!/bin/bash
# Push the vault's Library docs (SOPs folder + the meta files in _scripts/library/meta) into the app.
# Usage: scripts/sync-library.sh [https://your-app]   (defaults to production)
# Auth: the agents token at ~/.config/personal-os/agents-token (same one agents use to post to the feed).
# Env: LIBRARY_META_DIR to read meta files from another folder, LIBRARY_DRY_RUN=1 to print without posting.
set -euo pipefail

APP="${1:-https://claude-tau-six.vercel.app}"
TOKEN_FILE="$HOME/.config/personal-os/agents-token"
VAULT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Abdi's Brain"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$TOKEN_FILE" ]; then echo "missing $TOKEN_FILE" >&2; exit 1; fi
if [ ! -d "$VAULT" ]; then echo "missing $VAULT" >&2; exit 1; fi

python3 "$HERE/sync-library.py" "$VAULT" "$APP" "$TOKEN_FILE"
