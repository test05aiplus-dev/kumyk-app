#!/bin/bash
# Устанавливает APK на эмулятор, запускает и выводит журнал сбоев
set -x
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -W -n ru.kumyk.app/.MainActivity
sleep 20
echo "===== PID ====="
adb shell pidof ru.kumyk.app || echo "PROCESS NOT RUNNING"
echo "===== CRASH ====="
adb logcat -d -b crash
echo "===== RUNTIME ====="
adb logcat -d | grep -E "AndroidRuntime|FATAL|ru.kumyk|chromium|WebView" | head -150
echo "===== SCREEN ====="
adb exec-out screencap -p > /tmp/s.png
echo "PNG_B64_START"
base64 -w0 /tmp/s.png
echo
echo "PNG_B64_END"
exit 0
