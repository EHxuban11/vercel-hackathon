#!/bin/bash
# Builds PhoneJail.app (+ dmg). Run on a Mac: ./macos/build.sh
set -euo pipefail
cd "$(dirname "$0")"

APP=PhoneJail.app
rm -rf "$APP" PhoneJail.dmg
mkdir -p "$APP/Contents/MacOS"

swiftc -O -o "$APP/Contents/MacOS/PhoneJail" Config.swift main.swift

cat > "$APP/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>PhoneJail</string>
  <key>CFBundleIdentifier</key><string>app.phonejail.blocker</string>
  <key>CFBundleName</key><string>Phone Jail</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
  <key>NSAppleEventsUsageDescription</key>
  <string>Phone Jail closes distracting browser tabs during your focus sessions.</string>
</dict>
</plist>
EOF

hdiutil create -quiet -volname "Phone Jail" -srcfolder "$APP" -ov -format UDZO PhoneJail.dmg
echo "Built: macos/$APP and macos/PhoneJail.dmg"
