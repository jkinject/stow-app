#!/usr/bin/env bash
# 어디뒀지 (Stow) — Android 실기기 개발 실행
#
# 이 프로젝트에만 해당하는 두 가지 함정을 고정해 둔다:
#
#  1) JDK 17 을 강제한다.
#     JDK 24+ 는 네이티브 로딩 시 stderr 로 경고를 뿜는데, AGP 의 CMake 태스크가
#     **stderr 출력을 곧 실패로 간주**한다. 시스템 기본이 JDK 25 라 그냥 돌리면
#     :react-native-screens:configureCMakeDebug 에서 깨진다.
#
#  2) Metro 를 8081 이 아닌 포트로 띄운다.
#     이 머신의 8081 은 다른 프로젝트(com.safedrink.app)가 쓰고 있다.
#     그대로 두면 기기가 **남의 앱 번들**을 받아와 엉뚱한 오류가 난다.
#     adb reverse 로 기기의 8081 을 우리 포트에 매핑한다.
set -o pipefail
cd "$(dirname "$0")/.." || exit 1

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

DEVICE="${DEVICE:-}"
PORT="${PORT:-8082}"

[ -d "$JAVA_HOME" ] || { echo "❌ JDK 17 없음: $JAVA_HOME (brew install openjdk@17)"; exit 1; }
echo "JDK: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"

# 무선 기기 연결.
# ⚠ 무선 디버깅 포트는 껐다 켤 때마다 바뀐다. 주소를 하드코딩하면 매번 깨지므로
#   mDNS 로 찾는다. 폰과 Mac 이 **같은 Wi-Fi** 에 있어야 보인다.
if [ -z "$DEVICE" ]; then
  DEVICE=$(adb devices | tail -n +2 | grep -w device | head -1 | awk '{print $1}')
fi
if [ -z "$DEVICE" ]; then
  for CAND in $(adb mdns services 2>/dev/null | grep "_adb-tls-connect" | awk '{print $3}'); do
    adb connect "$CAND" >/dev/null 2>&1 && DEVICE=$CAND && break
  done
fi
[ -n "$DEVICE" ] || {
  echo "❌ 연결된 기기 없음."
  echo "   · 폰과 Mac 이 같은 Wi-Fi 인지 확인하세요 (Mac: $(ipconfig getifaddr en0 2>/dev/null))"
  echo "   · 폰의 무선 디버깅이 켜져 있는지 확인하세요"
  echo "   · 그래도 안 되면 DEVICE=ip:port 로 직접 지정하세요"
  exit 1
}
echo "기기: $DEVICE"

# 우리 Metro 가 이미 떠 있으면 재사용, 아니면 띄운다
if curl -s "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q running; then
  echo "Metro: $PORT 재사용"
else
  echo "Metro: $PORT 기동"
  npx expo start --port "$PORT" >/tmp/stow-metro.log 2>&1 &
  for _ in $(seq 1 40); do
    curl -s "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q running && break
    sleep 1
  done
fi

adb -s "$DEVICE" reverse --remove-all >/dev/null 2>&1
adb -s "$DEVICE" reverse tcp:8081 "tcp:$PORT" >/dev/null && echo "reverse: 기기:8081 → Mac:$PORT"

# 설치돼 있지 않으면 빌드
if ! adb -s "$DEVICE" shell pm list packages 2>/dev/null | grep -q net.jangstar.stow; then
  echo "APK 빌드 중 (첫 빌드는 5~10분)…"
  (cd android && ./gradlew :app:assembleDebug) || { echo "❌ 빌드 실패"; exit 1; }
  adb -s "$DEVICE" install -r android/app/build/outputs/apk/debug/app-debug.apk || exit 1
fi

adb -s "$DEVICE" shell am force-stop net.jangstar.stow
adb -s "$DEVICE" shell monkey -p net.jangstar.stow -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo "✅ 실행됨. 로그: adb -s $DEVICE logcat | grep ReactNativeJS"
