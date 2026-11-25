#!/usr/bin/env bash
# Build Pet Turtle as a native Android app and install it on a connected phone.
#   ./deploy.sh              build + install + launch on the only/first USB device
#   ./deploy.sh <serial>     pick a device (see `adb devices`)
#   ./deploy.sh --apk        just build the APK (android/app/build/outputs/apk/debug/)
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-/c/Program Files/Android/Android Studio/jbr}"
SDK="${ANDROID_HOME:-${LOCALAPPDATA:-$HOME/AppData/Local}/Android/Sdk}"
ADB="$SDK/platform-tools/adb"
APK=android/app/build/outputs/apk/debug/app-debug.apk
export ANDROID_HOME="$SDK"
# Gradle reads the SDK path from android/local.properties (git-ignored, machine-specific)
if [ ! -f android/local.properties ]; then
  SDK_WIN="$(cygpath -m "$SDK" 2>/dev/null || echo "$SDK")"
  echo "sdk.dir=${SDK_WIN//:/\\:}" > android/local.properties
fi

echo "› web build"
npm run build --silent
echo "› sync into Android project"
npx cap sync android >/dev/null
echo "› gradle assembleDebug"
(cd android && ./gradlew assembleDebug -q --console=plain)
echo "✔ APK: $APK ($(du -h "$APK" | cut -f1))"
[ "${1:-}" = "--apk" ] && exit 0

SERIAL="${1:-$("$ADB" devices | awk 'NR>1 && $2=="device" && $1 !~ /^(emulator|127\.0\.0\.1)/ {print $1; exit}')}"
[ -z "$SERIAL" ] && { echo "No phone found (adb devices)"; exit 1; }
echo "› installing on $SERIAL"
"$ADB" -s "$SERIAL" install -r "$APK" >/dev/null
"$ADB" -s "$SERIAL" shell monkey -p dev.petturtle -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo "✔ Pet Turtle launched on $SERIAL"
