#!/bin/bash
# Launches the Ecosystem Arcade fullscreen in kiosk mode on macOS (quit with Cmd+Q).
# First time only, make it runnable:  chmod +x start-kiosk.command
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="file://$DIR/index.html"

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --kiosk --no-first-run "$URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --kiosk --no-first-run "$URL"
else
  echo "Google Chrome or Microsoft Edge is recommended. Opening in the default browser instead."
  open "$URL"
fi
