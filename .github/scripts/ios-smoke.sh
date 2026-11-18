#!/bin/bash
# Запускает собранное iOS-приложение в симуляторе, делает снимок экрана и проверяет, что процесс жив
set -x
APP="ios/build/Debug-iphonesimulator/KumykTil.app"
DEV=$(xcrun simctl list devices available | grep -m1 -E "^\s+iPhone 1[5-7]( Pro)? \(" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -z "$DEV" ] && DEV=$(xcrun simctl list devices available | grep -m1 -E "^\s+iPhone" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
echo "device: $DEV"
xcrun simctl boot "$DEV"
xcrun simctl bootstatus "$DEV" -b
xcrun simctl install "$DEV" "$APP"
xcrun simctl launch "$DEV" ru.kumyk.app
sleep 20
echo "===== PROCESS ====="
xcrun simctl spawn "$DEV" launchctl list | grep -i kumyk || echo "PROCESS NOT RUNNING"
echo "===== CRASHES ====="
ls ~/Library/Logs/DiagnosticReports/ 2>/dev/null | grep -i kumyk || echo "no crash reports"
xcrun simctl io "$DEV" screenshot /tmp/ios.png
sips -Z 640 /tmp/ios.png --out /tmp/ios_small.png >/dev/null 2>&1 || cp /tmp/ios.png /tmp/ios_small.png
echo "PNG_B64_START"
base64 -b 76 -i /tmp/ios_small.png
echo
echo "PNG_B64_END"
exit 0
