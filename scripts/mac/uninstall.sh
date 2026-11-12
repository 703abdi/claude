#!/bin/zsh
# Stops the two Jarvis launchd jobs and removes them from ~/Library/LaunchAgents.
set -u

DEST="$HOME/Library/LaunchAgents"
for label in com.abdi.jarvis-tick com.abdi.jarvis-report; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$DEST/$label.plist"
  echo "Removed $label"
done
