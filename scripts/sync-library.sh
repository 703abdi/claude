#!/bin/bash
# Push the vault's SOPs folder into the app's Library.
# Usage: scripts/sync-library.sh [https://your-app]   (defaults to production)
# Auth: the agents token at ~/.config/personal-os/agents-token (same one agents use to post to the feed).
set -euo pipefail

APP="${1:-https://claude-tau-six.vercel.app}"
TOKEN_FILE="$HOME/.config/personal-os/agents-token"
VAULT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Abdi's Brain"
FOLDER="$VAULT/SOPs"

if [ ! -f "$TOKEN_FILE" ]; then echo "missing $TOKEN_FILE" >&2; exit 1; fi
if [ ! -d "$FOLDER" ]; then echo "missing $FOLDER" >&2; exit 1; fi

python3 - "$FOLDER" "$APP" "$TOKEN_FILE" <<'PY'
import json, os, re, sys, urllib.request
from datetime import datetime, timezone

folder, app, token_file = sys.argv[1], sys.argv[2], sys.argv[3]
token = open(token_file).read().strip()

def slugify(t):
    t = re.sub(r"\.md$", "", t.lower())
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")

docs = []
for name in sorted(os.listdir(folder)):
    if not name.endswith(".md") or name.startswith("_"):
        continue
    path = os.path.join(folder, name)
    title = name[:-3]
    m = re.match(r"^(\d+)\s", title)
    order = int(m.group(1)) if m else (-1 if title.lower() == "readme" else 99)
    if title.lower() == "readme":
        title = "Start here (index)"
    st = os.stat(path)
    docs.append({
        "slug": slugify(name),
        "title": title,
        "folder": "SOPs",
        "order": order,
        "content": open(path, encoding="utf-8").read(),
        "sourcePath": "SOPs/" + name,
        "mtime": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    })

# Remove docs the app has that the folder no longer does.
req = urllib.request.Request(app + "/api/library", headers={"Authorization": "Bearer " + token})
have = {d["slug"] for d in json.load(urllib.request.urlopen(req)) if d.get("folder") == "SOPs"}
gone = sorted(have - {d["slug"] for d in docs})

body = json.dumps({"docs": docs, "deletedSlugs": gone}).encode()
req = urllib.request.Request(app + "/api/library", data=body, method="POST",
                             headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
print(json.load(urllib.request.urlopen(req)), "from", len(docs), "files")
PY
