#!/usr/bin/env bash
set -euo pipefail

# 어디뒀지 (Stow) — 릴리스 APK 빌드 + 연결된 기기에 설치
#
# ⚠ 빌드 자체는 `build-android.sh` 가 한다. 이 파일은 **거기에 설치를 붙인 것**뿐이다.
#   빌드 로직을 두 벌로 두면 한쪽만 고쳐지는 날이 온다 — JDK 선택, prebuild 가 지우는
#   local.properties·jvmargs, 업로드 키 서명이 전부 그쪽에 모여 있다.
#
# 왜 릴리스 빌드로 기기에 까는가:
#   개발 빌드(app-debug.apk)는 Mac 의 Metro 서버에 붙어야만 켜진다. 노트북을 닫으면
#   앱이 안 열린다. 릴리스 빌드는 JS 번들이 앱 안에 굳어 있어 서버가 필요 없다.
#
# 사용:
#   ./scripts/release-apk.sh          빌드 + 설치
#   ./scripts/release-apk.sh --build  빌드만

cd "$(dirname "$0")/.."

./scripts/build-android.sh assembleRelease

[ "${1:-}" = "--build" ] && exit 0

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"

DEVICE=$("$ADB" devices | awk '$2=="device"{print $1; exit}')
if [ -z "$DEVICE" ]; then
  echo "✗ 연결된 기기가 없습니다."
  echo "  무선 디버깅: adb connect <IP>:<PORT>"
  exit 1
fi

APK=$(find android/app/build/outputs/apk/release -name '*.apk' -type f | head -1)
echo "· 설치  $DEVICE"
"$ADB" -s "$DEVICE" install -r "$APK"
