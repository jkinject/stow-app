#!/usr/bin/env bash
# 어디뒀지 (Stow) — 원격 Supabase 프로젝트 연동
#
# 전제: `npx supabase login` 이 끝나 있어야 한다 (브라우저 대화형이라 자동화 불가).
#
# 하는 일:
#   1. 프로젝트 링크
#   2. 원격에 적용될 마이그레이션 미리보기 (dry-run)
#   3. 확인 후 db push
#   4. 원격 스키마 검증 (RLS·정책·트리거가 실제로 살아 있는지)
#
# ⚠ db push 는 되돌리기 어렵다. 3단계에서 반드시 확인을 받는다.
set -o pipefail

REF="${1:-}"
if [ -z "$REF" ]; then
  echo "사용법: $0 <project-ref>"
  echo "  project-ref 는 대시보드 URL 의 https://supabase.com/dashboard/project/<여기> 입니다."
  echo "  또는: npx supabase projects list"
  exit 1
fi

echo "═══ 1. 프로젝트 링크 ═══"
npx supabase link --project-ref "$REF" || { echo "❌ 링크 실패"; exit 1; }
echo "✅ 링크 완료: $REF"

echo
echo "═══ 2. 원격에 적용될 마이그레이션 ═══"
npx supabase migration list

echo
echo "═══ 3. 원격 DB 에 push ═══"
echo "⚠ 아래 마이그레이션이 원격 데이터베이스에 적용됩니다. 되돌리기 어렵습니다."
read -r -p "계속하려면 'push' 를 입력하세요: " CONFIRM
if [ "$CONFIRM" != "push" ]; then
  echo "중단했습니다. 링크는 유지됩니다."
  exit 0
fi

npx supabase db push || { echo "❌ push 실패"; exit 1; }
echo "✅ push 완료"

echo
echo "═══ 4. 원격 스키마 검증 ═══"
npx supabase inspect db table-sizes --linked 2>/dev/null | head -20 || true
echo
echo "다음 수동 단계 (대시보드):"
echo "  · Authentication → Providers → Google 에 CLIENT_ID / SECRET 입력"
echo "  · Authentication → URL Configuration → Redirect URLs 에 stow://auth-callback 추가"
echo "  · Database → Extensions 에서 pg_cron 활성화 (휴지통 자동 정리용, 선택)"
echo "  · Storage 에 item-photos 버킷이 비공개로 생성됐는지 확인"
echo "  · 무료 티어라면: 7일 미사용 시 프로젝트가 일시정지됩니다 (계획 R19)"
