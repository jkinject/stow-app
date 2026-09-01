#!/usr/bin/env bash
# 어디뒀지 (Stow) — 주간 백업 (R20)
#
# 무료 티어에는 자동 백업이 없다. 이 앱의 전 가치가 "적힌 것이 실제와 맞다" 인데
# 데이터 유실은 회복 불가다. 주 1회 이 스크립트를 돌린다.
#
#   crontab 예시 (매주 일요일 03:00):
#   0 3 * * 0 ./scripts/backup.sh >> /tmp/stow-backup.log 2>&1
set -o pipefail
cd "$(dirname "$0")/.." || exit 1

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="supabase/backups"
mkdir -p "$OUT"

echo "[$STAMP] 백업 시작"
npx supabase db dump --linked -f "$OUT/schema-$STAMP.sql"           || { echo "❌ 스키마 덤프 실패"; exit 1; }
npx supabase db dump --linked --data-only -f "$OUT/data-$STAMP.sql" || { echo "❌ 데이터 덤프 실패"; exit 1; }

SZ_S=$(wc -c < "$OUT/schema-$STAMP.sql")
SZ_D=$(wc -c < "$OUT/data-$STAMP.sql")
echo "  스키마 ${SZ_S} bytes / 데이터 ${SZ_D} bytes"

# 사진은 Storage 에 있고 DB 덤프에 포함되지 않는다.
# 무엇이 있었는지라도 알 수 있게 경로 목록을 함께 남긴다 (계획 §4.11).
grep -oE "[0-9a-f-]{36}/[0-9a-f-]{36}/[^']+\.jpg" "$OUT/data-$STAMP.sql" 2>/dev/null | sort -u > "$OUT/photos-$STAMP.txt"
echo "  사진 경로 $(wc -l < "$OUT/photos-$STAMP.txt") 건 기록"

# 8주분만 보관
ls -1t "$OUT"/schema-*.sql 2>/dev/null | tail -n +9 | xargs -r rm -f
ls -1t "$OUT"/data-*.sql   2>/dev/null | tail -n +9 | xargs -r rm -f
ls -1t "$OUT"/photos-*.txt 2>/dev/null | tail -n +9 | xargs -r rm -f

echo "[$STAMP] 완료. ⚠ 복원해 본 적 없는 백업은 백업이 아니다 —"
echo "         분기마다 supabase/tests/verify_shell.sh 의 복원 리허설을 돌릴 것."
