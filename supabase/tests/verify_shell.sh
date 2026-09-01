#!/usr/bin/env bash
# 홈 스토어 M1 — pgTAP 으로 표현할 수 없는 두 검증
#   [7]  진짜 동시성: 별도 세션 20개가 동시에 -1 → 정확히 -20 (AC22)
#   [15] 백업 덤프 복원 리허설 (R20) — 복원해 본 적 없는 백업은 백업이 아니다
set -o pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_home-store}"
PSQL="docker exec -i $DB_CONTAINER psql -U postgres -q -t -A"
FAIL=0

ok()   { echo "  ✅ $1"; }
bad()  { echo "  ❌ $1"; FAIL=1; }

echo "═══ [7] adjust_item_quantity 동시성 ═══"

read -r -d '' SETUP <<'SQL'
drop schema if exists conc_test cascade;
delete from auth.users where email = 'conc@test.io';
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','conc@test.io','x',now(),now());
insert into households (id,name,created_by)
values ('99999999-0000-0000-0000-000000000099','동시성','99999999-9999-9999-9999-999999999999');
insert into household_members values ('99999999-0000-0000-0000-000000000099','99999999-9999-9999-9999-999999999999','owner');
insert into locations (id,household_id,name,created_by,updated_by)
values ('99991111-0000-0000-0000-000000000099','99999999-0000-0000-0000-000000000099','창고',
        '99999999-9999-9999-9999-999999999999','99999999-9999-9999-9999-999999999999');
insert into items (id,household_id,location_id,name,quantity,created_by,updated_by)
values ('99992222-0000-0000-0000-000000000099','99999999-0000-0000-0000-000000000099',
        '99991111-0000-0000-0000-000000000099','건전지',100,
        '99999999-9999-9999-9999-999999999999','99999999-9999-9999-9999-999999999999');
SQL

$PSQL -d postgres -c "$SETUP" >/dev/null 2>&1 || { echo "  ❌ 픽스처 생성 실패"; exit 1; }

# 20개 세션이 각자 독립 커밋으로 -1 한다.
# 앱 코드가 read-modify-write 였다면 여기서 lost update 가 생겨 -20 이 안 나온다.
for i in $(seq 1 20); do
  $PSQL -d postgres -c "
    set role authenticated;
    select set_config('request.jwt.claims','{\"sub\":\"99999999-9999-9999-9999-999999999999\",\"role\":\"authenticated\"}', false);
    select adjust_item_quantity('99992222-0000-0000-0000-000000000099', -1);
  " >/dev/null 2>&1 &
done
wait

QTY=$($PSQL -d postgres -c "select quantity from items where id='99992222-0000-0000-0000-000000000099'" | tr -d '[:space:]')
if [ "$QTY" = "80" ]; then
  ok "[7] 동시 20회 감소 → 100 에서 정확히 80 (lost update 없음)"
else
  bad "[7] 동시 20회 감소 후 수량이 80 이 아니라 $QTY — lost update 발생"
fi

# 이벤트도 20건이 남아야 한다
EV=$($PSQL -d postgres -c "select count(*) from item_events where item_id='99992222-0000-0000-0000-000000000099' and type='qty_changed'" | tr -d '[:space:]')
if [ "$EV" = "20" ]; then
  ok "[7] 감사 이벤트도 20건 모두 기록됐다 (AC21)"
else
  bad "[7] 감사 이벤트가 20건이 아니라 $EV 건"
fi

$PSQL -d postgres -c "delete from households where id='99999999-0000-0000-0000-000000000099'; delete from auth.users where email='conc@test.io';" >/dev/null 2>&1

echo
echo "═══ [15] 백업 덤프 복원 리허설 (R20) ═══"

# 원본 상태 채집
SRC_POL=$($PSQL -d postgres -c "select count(*) from pg_policies where schemaname='public'" | tr -d '[:space:]')
SRC_TRG=$($PSQL -d postgres -c "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal" | tr -d '[:space:]')
SRC_TBL=$($PSQL -d postgres -c "select count(*) from pg_tables where schemaname='public'" | tr -d '[:space:]')
SRC_FN=$($PSQL -d postgres -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | tr -d '[:space:]')
echo "  원본: 테이블 $SRC_TBL / 정책 $SRC_POL / 트리거 $SRC_TRG / 함수 $SRC_FN"

# 덤프 → 새 DB 로 복원
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres -n public -n auth -f /tmp/backup.sql 2>/dev/null
SIZE=$(docker exec "$DB_CONTAINER" stat -c %s /tmp/backup.sql 2>/dev/null || echo 0)
if [ "${SIZE:-0}" -gt 1000 ]; then ok "[15] 덤프 생성됨 (${SIZE} bytes)"; else bad "[15] 덤프가 비어 있음"; fi

$PSQL -d postgres -c "drop database if exists restore_rehearsal" >/dev/null 2>&1
$PSQL -d postgres -c "create database restore_rehearsal" >/dev/null 2>&1
docker exec -i "$DB_CONTAINER" psql -U postgres -d restore_rehearsal -q \
  -c "create schema if not exists auth; create extension if not exists pg_trgm;" >/dev/null 2>&1
docker exec -i "$DB_CONTAINER" psql -U postgres -d restore_rehearsal -q -f /tmp/backup.sql > /tmp/restore.log 2>&1
RESTORE_ERR=$(grep -c '^ERROR' /tmp/restore.log 2>/dev/null)
RESTORE_ERR=${RESTORE_ERR:-0}

DST_POL=$($PSQL -d restore_rehearsal -c "select count(*) from pg_policies where schemaname='public'" | tr -d '[:space:]')
DST_TRG=$($PSQL -d restore_rehearsal -c "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal" | tr -d '[:space:]')
DST_TBL=$($PSQL -d restore_rehearsal -c "select count(*) from pg_tables where schemaname='public'" | tr -d '[:space:]')
DST_FN=$($PSQL -d restore_rehearsal -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | tr -d '[:space:]')
DST_RLS=$($PSQL -d restore_rehearsal -c "select count(*) from pg_tables where schemaname='public' and rowsecurity=false" | tr -d '[:space:]')
echo "  복원본: 테이블 $DST_TBL / 정책 $DST_POL / 트리거 $DST_TRG / 함수 $DST_FN (복원 중 ERROR $RESTORE_ERR건)"

[ "$DST_TBL" = "$SRC_TBL" ] && ok "[15] 테이블 $DST_TBL 개가 모두 복원됐다" || bad "[15] 테이블 수 불일치 ($SRC_TBL → $DST_TBL)"
[ "$DST_POL" = "$SRC_POL" ] && ok "[15] RLS 정책 $DST_POL 개가 모두 복원됐다" || bad "[15] 정책 수 불일치 ($SRC_POL → $DST_POL)"
[ "$DST_TRG" = "$SRC_TRG" ] && ok "[15] 트리거 $DST_TRG 개가 모두 복원됐다" || bad "[15] 트리거 수 불일치 ($SRC_TRG → $DST_TRG)"
[ "$DST_FN"  = "$SRC_FN"  ] && ok "[15] 함수 $DST_FN 개가 모두 복원됐다"     || bad "[15] 함수 수 불일치 ($SRC_FN → $DST_FN)"
[ "$DST_RLS" = "0" ] && ok "[15] 복원본에도 RLS 미활성 테이블이 0개다" || bad "[15] 복원본에 RLS 미활성 테이블 $DST_RLS 개"

SECDEF=$($PSQL -d restore_rehearsal -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname in ('is_household_member','is_household_owner','shares_household_with')" | tr -d '[:space:]')
[ "$SECDEF" = "3" ] && ok "[15] SECURITY DEFINER 속성이 복원본에도 유지된다" || bad "[15] SECURITY DEFINER 유실 ($SECDEF/3)"

$PSQL -d postgres -c "drop database if exists restore_rehearsal" >/dev/null 2>&1

echo
if [ "$FAIL" = "0" ]; then echo "═══ 전체 통과 ═══"; else echo "═══ 실패 있음 ═══"; fi
exit $FAIL
