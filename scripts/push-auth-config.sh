#!/usr/bin/env bash
# 어디뒀지 (Stow) — 원격 Supabase 에 인증 설정(config.toml) 반영
#
# supabase/config.toml 의 [auth.external.google] 는 env(...) 참조라
# 실제 값은 환경변수나 .env.production.local 에서 온다. 두 곳 다 gitignore 된다.
#
# 사용:
#   ./scripts/push-auth-config.sh
set -o pipefail
cd "$(dirname "$0")/.." || exit 1

# 1) 이미 환경에 있으면 그대로 쓰고, 없으면 .env.production.local 에서 읽는다
if [ -z "${SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID:-}" ] && [ -f .env.production.local ]; then
  set -a; . ./.env.production.local; set +a
fi

# ⚠ RESEND_* 가 없으면 config push 가 `env(RESEND_API_KEY)` 를 **빈 문자열로** 밀어
#   넣는다. 그러면 SMTP 가 켜진 채 인증에 실패해 **메일이 한 통도 안 나간다** —
#   화면에는 "메일을 보냈습니다" 가 뜨므로 아무도 눈치채지 못한다. 먼저 막는다.
miss=0
for v in SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET \
         RESEND_API_KEY RESEND_SENDER; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then echo "❌ $v 없음"; miss=1; else echo "✅ $v (${#val}자)"; fi
done
if [ "$miss" = "1" ]; then
  cat <<'MSG'

빠진 값을 .env.production.local 에 넣으세요. 값이 화면에 찍히지 않게 붙여넣기로:

  cd /Users/tim/Documents/projects/home-store

  # Resend (https://resend.com/api-keys 에서 발급)
  #   RESEND_SENDER 는 Resend 에서 **인증한 도메인**의 주소여야 합니다.
  #   도메인 인증 전이라면 onboarding@resend.dev — 단, 본인에게만 도착합니다.
  read -rs -p 'RESEND_API_KEY: ' K; echo
  printf 'RESEND_API_KEY=%s\n' "$K" >> .env.production.local
  printf 'RESEND_SENDER=%s\n' 'no-reply@example.com' >> .env.production.local

  # 구글 OAuth (값이 이미 셸에 있다면)
  printf 'SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=%s\nSUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=%s\n' \
    "$SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID" "$SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET" \
    >> .env.production.local

MSG
  exit 1
fi

REF=$(node -e "console.log(require('fs').readFileSync('supabase/.temp/project-ref','utf8').trim())" 2>/dev/null)
[ -n "$REF" ] || { echo "❌ 링크된 프로젝트 없음 (npx supabase link)"; exit 1; }
echo "프로젝트: $REF"

echo
echo "=== config push ==="
npx supabase config push || { echo "❌ push 실패"; exit 1; }

echo
echo "=== 검증 ==="
API="https://$REF.supabase.co"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/auth/v1/authorize?provider=google&redirect_to=stow://auth-callback")
if [ "$CODE" = "302" ]; then
  echo "✅ 구글 provider 활성화됨 (HTTP 302)"
  LOC=$(curl -s -o /dev/null -w '%{redirect_url}' "$API/auth/v1/authorize?provider=google&redirect_to=stow://auth-callback")
  echo "   리디렉션 대상: $(echo "$LOC" | cut -d? -f1)"
else
  echo "❌ 아직 비활성 (HTTP $CODE)"
  curl -s "$API/auth/v1/authorize?provider=google&redirect_to=stow://auth-callback" | head -c 200; echo
  exit 1
fi

echo
echo "=== 메일 발송 확인 ==="
# ⚠ 실제로 한 통 보내 본다. 설정만 밀어 넣고 끝내면, SMTP 인증이 틀려도
#   화면에는 "메일을 보냈습니다" 가 뜨기 때문에 **아무도 모른다.**
if [ -n "${SMTP_TEST_EMAIL:-}" ]; then
  ANON=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env.production.local | cut -d= -f2-)
  RES=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/v1/magiclink" \
    -H "apikey: $ANON" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$SMTP_TEST_EMAIL\"}")
  case "$RES" in
    200) echo "✅ 발송 요청 수락됨 (HTTP 200) — $SMTP_TEST_EMAIL 받은편지함을 확인하세요";;
    429) echo "⚠️  레이트리밋 (HTTP 429). max_frequency(60s) 안에 또 보냈을 수 있습니다";;
    *)   echo "❌ 발송 실패 (HTTP $RES) — SMTP 설정을 확인하세요"; exit 1;;
  esac
else
  cat <<'MSG'
⏭  건너뜀. 실제로 메일이 나가는지 보려면 본인 주소를 주고 다시 실행하세요:

     SMTP_TEST_EMAIL=you@example.com ./scripts/push-auth-config.sh

   ⚠ Resend 도메인 인증 전에는 **Resend 계정 주인 주소로만** 도착합니다.
MSG
fi
