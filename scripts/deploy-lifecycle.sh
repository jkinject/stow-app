#!/usr/bin/env bash
set -euo pipefail

# 휴면 집 정리 기능을 운영에 올린다.
#
# ⚠⚠ 이 스크립트가 존재하는 이유: `CRON_SECRET` 이 **세 곳에 같아야** 한다.
#      1) .env.production.local  (STOW_CRON_SECRET — 기억용 원본)
#      2) Edge Function 의 secrets
#      3) DB vault 의 cron_secret
#    손으로 옮기면 어긋난다. 어긋나면 cron 이 함수를 불러도 403 으로 튕기는데,
#    **아무 오류도 안 난다** — 그냥 정리가 영원히 안 돌 뿐이라 알아채기 어렵다.
#
# ⚠ 순서가 중요하다. 마이그레이션이 **먼저** 올라가야 한다. 앱이 touch_household 를
#   부르고, 그게 없으면 접속 기록이 안 남아 **쓰는 집이 휴면으로 판정된다.**

cd "$(dirname "$0")/.."

if [ ! -f .env.production.local ]; then
  echo "✗ .env.production.local 이 없습니다." >&2
  exit 1
fi
set -a; . ./.env.production.local; set +a

if [ -z "${STOW_CRON_SECRET:-}" ]; then
  echo "✗ STOW_CRON_SECRET 이 없습니다. 아래로 만드세요:" >&2
  echo "    printf 'STOW_CRON_SECRET=%s\\n' \"\$(openssl rand -base64 36 | tr -d '\\n/+=' | cut -c1-40)\" >> .env.production.local" >&2
  exit 1
fi
if [ -z "${RESEND_API_KEY:-}" ] || [ -z "${RESEND_SENDER:-}" ]; then
  echo "✗ RESEND_API_KEY / RESEND_SENDER 가 없습니다 — 예고 메일을 보낼 수 없습니다." >&2
  exit 1
fi

PROJECT_URL="${EXPO_PUBLIC_SUPABASE_URL:?EXPO_PUBLIC_SUPABASE_URL 이 필요합니다}"
FUNCTIONS_URL="${PROJECT_URL}/functions/v1"

echo "· 대상  ${PROJECT_URL#https://}"
echo

# ── 1) 스키마 ──────────────────────────────────────────────────
echo "1/4 마이그레이션 (앱이 touch_household 를 부르므로 가장 먼저)"
npx supabase db push

# ── 2) Edge Function ──────────────────────────────────────────
echo
echo "2/4 Edge Function 배포"
npx supabase functions deploy household-lifecycle

# ── 3) 함수 쪽 비밀 ────────────────────────────────────────────
#
# ⚠⚠ 비밀을 **명령줄 인자로 넘기지 않는다.** `secrets set NAME=VALUE` 로 주면 같은
#   기계의 다른 사용자가 `ps` 로 그대로 볼 수 있고, 셸 히스토리에도 남는다.
#   umask 로 600 짜리 임시 파일에 적어 넘기고 끝나면 지운다. 아래 vault 단계도 같다.
echo
echo "3/4 Edge Function 비밀 (값은 출력하지 않습니다)"
TMPDIR_SECURE=$(umask 077 && mktemp -d -t stow-deploy.XXXXXX)
cleanup() { rm -rf "$TMPDIR_SECURE"; }
trap cleanup EXIT

ENVF="$TMPDIR_SECURE/secrets.env"
{
  printf 'CRON_SECRET=%s\n'    "$STOW_CRON_SECRET"
  printf 'RESEND_API_KEY=%s\n' "$RESEND_API_KEY"
  printf 'RESEND_SENDER=%s\n'  "$RESEND_SENDER"
} > "$ENVF"
npx supabase secrets set --env-file "$ENVF" >/dev/null
echo "   CRON_SECRET · RESEND_API_KEY · RESEND_SENDER 설정 완료" 

# ── 4) DB 쪽 비밀 ──────────────────────────────────────────────
# ⚠ vault.create_secret 은 같은 이름이 있으면 실패한다. 있으면 갱신한다.
echo
echo "4/4 DB vault (cron 이 함수를 부를 때 쓰는 값)"
TMP="$TMPDIR_SECURE/vault.sql"
cat > "$TMP" <<SQLEOF
do \$\$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'cron_secret';
  if v_id is null then
    perform vault.create_secret('${STOW_CRON_SECRET}', 'cron_secret');
  else
    perform vault.update_secret(v_id, '${STOW_CRON_SECRET}');
  end if;

  select id into v_id from vault.secrets where name = 'functions_base_url';
  if v_id is null then
    perform vault.create_secret('${FUNCTIONS_URL}', 'functions_base_url');
  else
    perform vault.update_secret(v_id, '${FUNCTIONS_URL}');
  end if;
end \$\$;
SQLEOF

if ! npx supabase db query --linked --file "$TMP" >/dev/null; then
  echo "   ⚠ 자동 등록에 실패했습니다." >&2
  echo "     Supabase 대시보드 → SQL Editor 에서 아래 파일 내용을 실행하세요:" >&2
  echo "       $TMP" >&2
  echo "     ⚠ 비밀이 들어 있습니다. 실행 뒤 파일과 편집기 내용을 지우세요." >&2
  trap - EXIT   # 사람이 쓸 수 있게 남긴다
  exit 1
fi
echo "   cron_secret · functions_base_url 등록 완료"

echo
echo "✓ 끝났습니다. 확인:"
echo "   · 스케줄     select jobname, schedule from cron.job;"
echo "   · 최근 실행  select * from maintenance_log order by id desc limit 5;"
echo "   · 손으로 한 번 돌려보기  select public.run_household_lifecycle();"
