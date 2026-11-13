#!/bin/zsh
# Copies the two Jarvis launchd jobs into ~/Library/LaunchAgents and starts them.
# Run it yourself when you want the Mac to tick and report. Undo with uninstall.sh.
set -eu

HERE="/Users/abdi/Projects/claude-personal-os/scripts/mac"
DEST="$HOME/Library/LaunchAgents"
mkdir -p "$DEST"
chmod +x "$HERE/jarvis-tick.sh"

for label in com.abdi.jarvis-tick com.abdi.jarvis-report; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  cp "$HERE/$label.plist" "$DEST/$label.plist"
  launchctl bootstrap "gui/$(id -u)" "$DEST/$label.plist"
  echo "Loaded $label"
done
