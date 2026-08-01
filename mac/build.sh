#!/bin/bash
# Build NovaBar.app — the menu-bar Nova. No Xcode project, no signing:
# swiftc plus a hand-written bundle, which is all a local menu-bar app needs.
set -euo pipefail
cd "$(dirname "$0")"

APP="$HOME/Applications/NovaBar.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -o "$APP/Contents/MacOS/NovaBar" NovaBar/main.swift

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>NovaBar</string>
  <key>CFBundleDisplayName</key><string>Nova</string>
  <key>CFBundleIdentifier</key><string>com.novaos.novabar</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleExecutable</key><string>NovaBar</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <!-- menu-bar only: no Dock icon, no app switcher entry -->
  <key>LSUIElement</key><true/>
  <!-- the microphone prompt macOS shows the first time Nova listens -->
  <key>NSMicrophoneUsageDescription</key>
  <string>Nova listens when you talk to it.</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>Nova turns what you say into text so it can answer.</string>
</dict>
PLIST
echo '</plist>' >> "$APP/Contents/Info.plist"

# ad-hoc signature: enough for a locally built app to hold mic permission
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo "Built $APP"
echo
echo "Next:"
echo "  open \"$APP\"            # launch it (the ring appears in your menu bar)"
echo "  ⌥Space                    # summon or dismiss Nova from anywhere"
echo
echo "To point it at your local server instead of the published app:"
echo "  defaults write com.novaos.novabar novaBarURL 'http://localhost:4173-hosted-url/#/voice'"
echo "To launch it at login: System Settings → General → Login Items → +"
