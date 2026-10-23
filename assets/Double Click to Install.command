#!/bin/bash
clear
echo "Installing Modula..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_IN_DMG="$SCRIPT_DIR/Modula.app"
APP_IN_APPS="/Applications/Modula.app"

# Copy Modula to /Applications
if [ -d "$APP_IN_DMG" ]; then
  pkill -x Modula 2>/dev/null
  rm -rf "$APP_IN_APPS" 2>/dev/null
  cp -R "$APP_IN_DMG" /Applications/
fi

# Setup and launch
if [ -d "$APP_IN_APPS" ]; then
  xattr -cr "$APP_IN_APPS" 2>/dev/null
  codesign --force --deep --sign - "$APP_IN_APPS" 2>/dev/null
  open "$APP_IN_APPS"
fi

osascript -e 'tell application "Terminal" to close front window' 2>/dev/null & exit
