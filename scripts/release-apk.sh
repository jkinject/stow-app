#!/usr/bin/env bash
# 어디뒀지 (Stow) — 독립 실행 APK 빌드·설치
#
# 개발용 빌드(app-debug.apk)는 **Mac 의 Metro 서버에 붙어야만** 켜진다.
# 노트북을 닫으면 앱이 안 열린다. 실제로 들고 다니며 쓰려면 이 스크립트로 만든
# 릴리스 빌드를 깔아야 한다 — JS 번들이 앱 안에 굳어 있어 서버가 필요 없다.
#
# ⚠ 이 빌드는 **debug 키스토어로 서명된다** (Expo 템플릿 기본값).
#   · 좋은 점: SHA-1 이 개발 빌드와 같아서 **구글 로그인이 그대로 동작한다** (R21 회피)
#   · 한계: 이 서명으로는 **Play 스토어에 올릴 수 없다.** 출시할 때는 별도 키스토어를
#     만들고 그 SHA-1 을 Google Cloud Console 에 등록해야 한다 (M9).
#
#   사용: ./scripts/release-apk.sh          빌드 + 연결된 기기에 설치
#         ./scripts/release-apk.sh --build  빌드만
set -o pipefail
cd "$(dirname "$0")/.." || exit 1

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

APK="android/app/build/outputs/apk/release/app-release.apk"

echo "릴리스 APK 빌드 중… (처음엔 5~10분, 이후 증분은 더 빠름)"
(cd android && ./gradlew :app:assembleRelease) || { echo "❌ 빌드 실패"; exit 1; }
[ -f "$APK" ] || { echo "❌ APK 가 생기지 않았습니다: $APK"; exit 1; }
echo "✅ $(du -h "$APK" | cut -f1)  $APK"

[ "$1" = "--build" ] && exit 0

WIRELESS="${WIRELESS:-192.168.200.111:36657}"
adb connect "$WIRELESS" >/dev/null 2>&1
DEVICE=$(adb devices | tail -n +2 | grep -w device | head -1 | awk '{print $1}')
[ -n "$DEVICE" ] || { echo "⚠ 연결된 기기가 없습니다. APK 를 직접 옮겨 설치하세요."; exit 0; }

# ⚠ 개발 빌드와 패키지명이 같아서 서로를 덮어쓴다. 서명이 같으므로 -r 로 덮어쓰면
#   로그인 세션과 앱 데이터가 그대로 남는다 (다시 로그인할 필요 없음).
echo "설치 중… ($DEVICE)"
adb -s "$DEVICE" install -r "$APK" || exit 1
adb -s "$DEVICE" reverse --remove-all >/dev/null 2>&1   # 개발 서버 터널 제거
echo "✅ 설치 완료. 이제 Mac 없이도 앱이 켜집니다."
echo "   (개발 빌드로 돌아가려면 ./scripts/android-dev.sh)"
