#!/bin/bash
# Modula 1-Click Setup & Authorization for macOS
clear

echo "=================================================="
echo "         Modula — 1-Click Authorization           "
echo "=================================================="
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_IN_DMG="$SCRIPT_DIR/Modula.app"
APP_IN_APPS="/Applications/Modula.app"

# 1. Copy Modula to /Applications
if [ -d "$APP_IN_DMG" ]; then
  echo "📦 Installing Modula to /Applications..."
  rm -rf "$APP_IN_APPS" 2>/dev/null
  cp -R "$APP_IN_DMG" /Applications/
fi

# 2. Clear quarantine attribute on /Applications/Modula.app
if [ -d "$APP_IN_APPS" ]; then
  echo "🔓 Clearing macOS Gatekeeper quarantine..."
  xattr -cr "$APP_IN_APPS" 2>/dev/null
  codesign --force --deep --sign - "$APP_IN_APPS" 2>/dev/null
  
  echo "✓ Modula successfully authorized!"
  echo "🚀 Launching Modula..."
  open "$APP_IN_APPS"
else
  echo "⚠️ Could not locate Modula.app in /Applications."
fi

echo ""
echo "Done! You can close this window."
sleep 1
osascript -e 'tell application "Terminal" to close front window' & exit
