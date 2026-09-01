#!/usr/bin/env bash
set -euo pipefail

# 안드로이드 릴리스 빌드.
#
# ⚠⚠ 이 스크립트가 존재하는 이유: `npx expo prebuild` 는 **android/ 를 통째로 지우고
#    다시 만든다.** 그래서 손으로 고쳐 둔 것들이 조용히 사라지고, 다음 빌드가
#    엉뚱한 오류로 죽는다. 2026-09-01 빌드 한 번에 아래 세 개를 연달아 밟았다.
#    그때마다 원인을 다시 찾지 않으려고 여기 모아 둔다.
#
#   1) local.properties 가 사라진다
#        → "SDK location not found"
#   2) gradle.properties 의 jvmargs 가 템플릿 기본값으로 되돌아간다
#        → 데몬이 Metaspace 를 다 쓰고 **출력 없이 CPU 만 태운다.**
#          멈춘 것처럼 보이는데 죽지도 않는다 (전에 데몬 하나가 20시간 46분 살아 있었다)
#   3) JDK 버전 (이건 prebuild 탓이 아니라 기계 탓)
#        → JDK 24+ 는 `System.load` 를 제한하고 경고를 stderr 로 뱉는데(JEP 472),
#          AGP 가 prefab 의 stderr 을 한 줄씩 읽어 오류를 판정한다. 그 경고 한 줄이
#          오류로 잡혀서 이렇게 죽는다:
#            IllegalStateException: WARNING: A restricted method in java.lang.System...
#              at GeneratePrefabPackagesKt.reportErrors(GeneratePrefabPackages.kt:269)
#          Expo SDK 57 / RN 0.86 은 JDK 17 이다. 아래에서 강제로 골라 준다.

cd "$(dirname "$0")/.."
ROOT="$PWD"

# ── JDK 17 고르기 ───────────────────────────────────────────────
# Android Studio 번들 JBR 을 먼저 본다 — 안드로이드 도구가 실제로 테스트하는 조합이다.
for candidate in \
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  "/opt/homebrew/opt/openjdk@17" \
  "/usr/local/opt/openjdk@17"
do
  if [ -x "$candidate/bin/java" ] && "$candidate/bin/java" -version 2>&1 | grep -q '"17\.'; then
    export JAVA_HOME="$candidate"
    break
  fi
done

if [ -z "${JAVA_HOME:-}" ]; then
  echo "✗ JDK 17 을 찾지 못했습니다." >&2
  echo "  현재 java: $(java -version 2>&1 | head -1)" >&2
  echo "  JDK 24+ 로는 prefab 단계에서 빌드가 죽습니다 (이 파일 위쪽 주석 3번 참고)." >&2
  echo "  해결: Android Studio 를 설치하거나  brew install openjdk@17" >&2
  exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"
echo "· JDK  $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"

# ── Android SDK ────────────────────────────────────────────────
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ ! -d "$ANDROID_HOME/platform-tools" ]; then
  echo "✗ Android SDK 를 찾지 못했습니다: $ANDROID_HOME" >&2
  exit 1
fi
# prebuild 가 지웠다면 다시 만든다
if [ ! -f android/local.properties ]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
  echo "· local.properties 를 다시 만들었습니다 (prebuild 가 지웠습니다)"
fi

# ── Gradle 메모리 ──────────────────────────────────────────────
# 템플릿 기본값(-Xmx2048m -XX:MaxMetaspaceSize=512m)이면 릴리스 빌드가 Metaspace 로 죽는다
if ! grep -q '^org.gradle.jvmargs=.*MaxMetaspaceSize=1024m' android/gradle.properties; then
  echo "· jvmargs 가 기본값으로 되돌아가 있어 다시 올립니다 (prebuild 가 덮었습니다)"
  # 기존 줄을 지우고 새로 넣는다
  sed -i '' '/^org.gradle.jvmargs=/d' android/gradle.properties
  printf '\n# ⚠ prebuild 가 덮는다. scripts/build-android.sh 가 매번 다시 넣는다.\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m\n' \
    >> android/gradle.properties
fi

# ── 환경변수 ───────────────────────────────────────────────────
# ⚠ Expo CLI 는 기본으로 .env.local 을 읽는다. 릴리스에는 **운영 값**이 들어가야 한다.
if [ -f .env.production.local ]; then
  set -a; . ./.env.production.local; set +a
  export EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY
  echo "· Supabase  ${EXPO_PUBLIC_SUPABASE_URL#https://}"
else
  echo "✗ .env.production.local 이 없습니다 — 릴리스에 운영 설정이 안 들어갑니다." >&2
  exit 1
fi

# ── 업로드 키 서명 ─────────────────────────────────────────────
# ⚠ 없으면 **디버그 키로 서명된다.** 빌드는 성공하지만 Play Store 가 거절한다.
#   조용히 넘어가면 업로드 직전에야 알게 되므로 여기서 크게 경고한다.
if [ -n "${STOW_UPLOAD_STORE_FILE:-}" ] && [ -f "$STOW_UPLOAD_STORE_FILE" ]; then
  export STOW_UPLOAD_STORE_FILE STOW_UPLOAD_STORE_PASSWORD STOW_UPLOAD_KEY_ALIAS STOW_UPLOAD_KEY_PASSWORD
  echo "· 서명  업로드 키 ($(basename "$STOW_UPLOAD_STORE_FILE"))"
else
  echo "⚠ 업로드 키가 없어 **디버그 키로 서명**합니다 — Play Store 에 올릴 수 없습니다."
  echo "  .env.production.local 의 STOW_UPLOAD_* 를 확인하세요."
fi

# ── 빌드 ───────────────────────────────────────────────────────
# assembleRelease → APK (기기 설치용) / bundleRelease → AAB (Play Store 업로드용)
TASK="${1:-assembleRelease}"
echo "· gradlew $TASK"
./android/gradlew -p android "$TASK" --no-daemon

OUT=$(find android/app/build/outputs \( -name '*.aab' -o -name '*.apk' \) -type f 2>/dev/null \
      | sort -r | head -1)
if [ -n "$OUT" ]; then
  echo
  echo "✓ $OUT  ($(du -h "$OUT" | cut -f1))"
fi
