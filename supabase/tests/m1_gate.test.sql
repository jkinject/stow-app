-- 홈 스토어 M1 보안 게이트 — 계획 §5 M1 완료조건 + §7.2 통합 테스트
--
-- RLS 거부의 실제 동작 (실측 확인):
--   SELECT 거부 → 0행 (에러 아님)
--   UPDATE 거부 → 0행 영향 (에러 아님)
--   DELETE 정책 없음 → 0행 영향 (에러 아님)
--   INSERT 거부 → 에러 42501
-- 이 차이 때문에 "거부"를 전부 throws_ok 로 쓰면 테스트가 통과해 버린다.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ═════════════════════════════════════════════════════════════
-- 픽스처 — 가구 A(사용자 a) / 가구 B(사용자 b)
-- ═════════════════════════════════════════════════════════════
\set ua '11111111-1111-1111-1111-111111111111'
\set ub '22222222-2222-2222-2222-222222222222'
\set ha 'aaaaaaaa-0000-0000-0000-00000000000a'
\set hb 'bbbbbbbb-0000-0000-0000-00000000000b'
\set la 'aaaa1111-0000-0000-0000-00000000000a'
\set lb 'bbbb1111-0000-0000-0000-00000000000b'
\set ca 'aaaac111-0000-0000-0000-00000000000a'
\set ia 'aaaa2222-0000-0000-0000-00000000000a'
\set ib 'bbbb2222-0000-0000-0000-00000000000b'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data)
values (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.io','x',now(),now(),'{"full_name":"가나다"}'),
       (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.io','x',now(),now(),'{"full_name":"라마바"}');

insert into households (id,name,created_by) values (:'ha','가구A',:'ua'), (:'hb','가구B',:'ub');
insert into household_members values (:'ha',:'ua','owner'), (:'hb',:'ub','owner');
-- 가구 A 의 카테고리 — 타 가구 사용자가 못 보는지 검사하려면 존재해야 한다
insert into categories (id, household_id, name, created_by, updated_by)
values ('ccccaaaa-0000-0000-0000-0000000000fa', :'ha', '고정 카테고리', :'ua', :'ua');
insert into locations (id,household_id,name,created_by,updated_by)
values (:'la',:'ha','현관 팬트리',:'ua',:'ua'), (:'lb',:'hb','안방',:'ub',:'ub');
insert into containers (id,household_id,location_id,name,created_by,updated_by)
values (:'ca',:'ha',:'la','3번 박스',:'ua',:'ua');
insert into items (id,household_id,location_id,container_id,name,quantity,created_by,updated_by)
values (:'ia',:'ha',:'la',:'ca','건전지 AA',10,:'ua',:'ua');
insert into items (id,household_id,location_id,name,quantity,created_by,updated_by)
values (:'ib',:'hb',:'lb','우산',1,:'ub',:'ub');
-- ⚠ 가구당 코드는 한 행이다(2026-08-31) — 만료도 소비도 없다.
--   이 픽스처는 households 를 RPC 가 아니라 직접 INSERT 하므로 코드도 직접 넣는다.
insert into invites (household_id,code,created_by) values (:'ha','INVITE-A-OK',:'ua');

-- 버킷은 storage.buckets 자체 RLS 때문에 authenticated 로는 안 보인다 → postgres 로 확인
select is((select public from storage.buckets where id='item-photos'), false,
  '[2-S] item-photos 는 비공개 버킷이다 (서명 URL 로만 접근, AC28)');

-- 가입 트리거가 profiles 를 만들었는지
-- ⚠ 전체 개수를 세면 seed.sql 에 결합된다. 자기 픽스처만 확인한다.
select is((select count(*)::int from profiles where id in (:'ua', :'ub')), 2,
  '가입 트리거가 테스트 사용자 2명의 profiles 를 생성한다');
select is((select display_name from profiles where id = :'ua'), '가나다', '가입 시 메타데이터의 이름이 profiles 로 들어간다');

-- ═════════════════════════════════════════════════════════════
-- [검증 1] RLS 미활성 public 테이블 0개
-- ⚠ R2(안 켜면 유출)를 막는 검사. R18(켜고 정책 없음)은 검증 3이 맡는다.
-- ═════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from pg_tables where schemaname='public' and rowsecurity=false),
  0, '[1] RLS 미활성 public 테이블이 0개다');

-- ═════════════════════════════════════════════════════════════
-- [검증 3] RLS 정책 커버리지 — 계획 §4.3 요약표와 pg_policies 대조
-- 정책이 "있어야 하는" 칸이 실제로 있는지. (R18: 켜놓고 안 쓰면 전면 거부)
-- ═════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from pg_policies p
    where p.schemaname='public' and p.tablename='households' and p.cmd='SELECT'),
  1, '[3] households 에 SELECT 정책이 있다 (없으면 자기 가구도 못 읽는다)');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='locations'),
  3, '[3] locations 에 정책 3개(select/insert/update) — delete 없음이 정상');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='containers'),
  3, '[3] containers 에 정책 3개');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='items'),
  3, '[3] items 에 정책 3개 — DELETE 정책 부재가 soft delete 를 강제한다');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='profiles' and cmd='SELECT'),
  1, '[3] profiles 에 SELECT 정책이 있다 (AC20 표시 이름 조회)');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='invites' and cmd='INSERT'),
  1, '[3] invites 에 INSERT 정책이 있다 (owner 초대 발급)');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='item_events'),
  1, '[3] item_events 에 SELECT 정책 1개뿐 — 쓰기는 트리거 전용');
select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='maintenance_log'),
  0, '[3] maintenance_log 에 정책 0개 = 클라이언트 전면 차단');

-- 헬퍼 함수가 SECURITY DEFINER 인지 (재귀 차단의 핵심)
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('is_household_member','is_household_owner','shares_household_with')
      and p.prosecdef),
  3, '[3] RLS 헬퍼 3종이 모두 SECURITY DEFINER 다 (R1 무한재귀 차단)');

-- ═════════════════════════════════════════════════════════════
-- [검증 2] 크로스 테넌트 침투 — 사용자 b 가 가구 A 를 노린다 (AC27)
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from households        where id = :'ha'), 0, '[2] 타 가구 households 조회 차단');
select is((select count(*)::int from household_members where household_id = :'ha'), 0, '[2] 타 가구 멤버 조회 차단');
-- ⚠ 카테고리 크로스테넌트도 **여기서** 검사한다.
--   검증 12 에서 사용자 b 가 accept_invite 로 가구 A 에 **합류하므로**, 그 뒤에 검사하면
--   b 는 더 이상 외부인이 아니다 — 실제로 그 자리에 뒀다가 "안 보여야 하는데 보인다"로
--   실패했다(is_household_member(ha) = true 로 확인).
select is((select count(*)::int from categories where household_id = :'ha'), 0,
  '[2] 타 가구 categories 조회 차단');
select throws_ok(
  format($$insert into categories (household_id, name) values (%L, '침투')$$, :'ha'),
  '42501', null, '[2] 타 가구에 카테고리를 만들 수 없다');
select is((select count(*)::int from invites           where household_id = :'ha'), 0, '[2] 타 가구 invites 조회 차단');
select is((select count(*)::int from locations         where household_id = :'ha'), 0, '[2] 타 가구 locations 조회 차단');
select is((select count(*)::int from containers        where household_id = :'ha'), 0, '[2] 타 가구 containers 조회 차단');
select is((select count(*)::int from items             where household_id = :'ha'), 0, '[2] 타 가구 items 조회 차단');
select is((select count(*)::int from item_events       where household_id = :'ha'), 0, '[2] 타 가구 item_events 조회 차단');
select is((select count(*)::int from shopping_list     where household_id = :'ha'), 0, '[2] 타 가구 shopping_list 조회 차단');
select is((select count(*)::int from maintenance_log), 0, '[2] maintenance_log 조회 차단');
select is((select count(*)::int from profiles where id = :'ua'), 0, '[2] 같은 가구가 아닌 사람의 profiles 조회 차단');
select is((select count(*)::int from profiles where id = :'ub'), 1, '[2] 본인 profiles 는 조회된다');

-- INSERT 는 42501 로 튕긴다
select throws_ok(
  format($$insert into locations (household_id,name,created_by,updated_by) values (%L,'침입',%L,%L)$$, :'ha', :'ub', :'ub'),
  '42501', null, '[2] 타 가구 locations INSERT 차단');
select throws_ok(
  format($$insert into items (id,household_id,location_id,name,created_by,updated_by) values (gen_random_uuid(),%L,%L,'침입',%L,%L)$$, :'ha', :'la', :'ub', :'ub'),
  '42501', null, '[2] 타 가구 items INSERT 차단');
select throws_ok(
  format($$insert into invites (household_id,code,created_by) values (%L,'HACK',%L)$$, :'ha', :'ub'),
  '42501', null, '[2] 타 가구 invites INSERT 차단');

-- UPDATE/DELETE 는 0행 (에러가 아니라 조용한 무효)
with u as (update items set name='해킹됨' where id = :'ia' returning 1)
  select is((select count(*)::int from u), 0, '[2] 타 가구 items UPDATE 는 0행');
with d as (delete from items where id = :'ia' returning 1)
  select is((select count(*)::int from d), 0, '[5] items 하드 DELETE 는 0행 — 정책 부재가 soft delete 를 강제 (AC24)');

-- ═════════════════════════════════════════════════════════════
-- [검증 2-S] Storage 크로스 테넌트 (AC28)
-- 사진 권한은 테이블과 **같은** is_household_member() 로 검증된다.
-- 인가 경로가 하나라는 것이 사진을 Supabase Storage 에 두는 핵심 이유다 (P2).
-- 경로 규약: {household_id}/{item_id}/{uuid}.jpg
-- ═════════════════════════════════════════════════════════════
select throws_ok(
  format($$insert into storage.objects (bucket_id, name, owner)
           values ('item-photos', %L, %L)$$,
         :'ha' || '/' || :'ia' || '/x.jpg', :'ub'),
  '42501', null, '[2-S] 타 가구 Storage 경로에 업로드할 수 없다 (AC28)');

select lives_ok(
  format($$insert into storage.objects (bucket_id, name, owner)
           values ('item-photos', %L, %L)$$,
         :'hb' || '/' || :'ib' || '/own.jpg', :'ub'),
  '[2-S] 자기 가구 경로에는 업로드할 수 있다');

select is((select count(*)::int from storage.objects
            where bucket_id='item-photos' and name like :'ha' || '/%'), 0,
  '[2-S] 타 가구 Storage 객체는 조회되지 않는다');

select is((select count(*)::int from storage.objects
            where bucket_id='item-photos' and name like :'hb' || '/%'), 1,
  '[2-S] 자기 가구 Storage 객체는 조회된다');

-- ═════════════════════════════════════════════════════════════
-- [검증 4] item_events 불변성 (P3)
-- ═════════════════════════════════════════════════════════════
select throws_ok(
  format($$insert into item_events (household_id,item_id,actor_id,type) values (%L,%L,%L,'updated')$$, :'hb', :'ib', :'ub'),
  '42501', null, '[4] 클라이언트가 item_events 를 직접 INSERT 할 수 없다');
with u as (update item_events set type='created' returning 1)
  select is((select count(*)::int from u), 0, '[4] 클라이언트가 item_events 를 UPDATE 할 수 없다');
with d as (delete from item_events returning 1)
  select is((select count(*)::int from d), 0, '[4] 클라이언트가 item_events 를 DELETE 할 수 없다');

-- ═════════════════════════════════════════════════════════════
-- [검증 12] 초대 — 비멤버는 코드를 조회조차 못 하지만 RPC 로는 참여 가능
-- ═════════════════════════════════════════════════════════════
select is((select count(*)::int from invites where code='INVITE-A-OK'), 0,
  '[12] 비멤버는 invites 를 직접 SELECT 할 수 없다 (accept_invite 가 DEFINER 여야 하는 이유)');
select throws_ok($$select accept_invite('NOSUCHCD')$$, null, null,
  '[12] 없는 초대 코드는 거부된다');
select lives_ok($$select accept_invite('INVITE-A-OK')$$,
  '[12] accept_invite RPC 로는 참여할 수 있다');
select is((select count(*)::int from items where household_id = :'ha'), 1,
  '[12] 참여 후에는 그 가구 물건이 보인다');
-- 코드가 영구·재사용이 된 뒤로는 두 번 눌러도 조용히 같은 집을 돌려준다.
-- 오류를 던지면 "이미 들어와 있다" 는 정상 상태가 실패처럼 보인다.
select lives_ok($$select accept_invite('INVITE-A-OK')$$,
  '[12] 같은 코드를 다시 써도 오류가 아니다 (멱등)');
select is((select count(*)::int from household_members where household_id = :'ha'), 2,
  '[12] 두 번 써도 멤버가 중복 생기지 않는다');

-- ═════════════════════════════════════════════════════════════
-- [검증 11] 가구 생성 닭과 달걀
-- ═════════════════════════════════════════════════════════════
select throws_ok(
  format($$insert into households (name,created_by) values ('직접생성',%L)$$, :'ub'),
  '42501', null, '[11] households 직접 INSERT 는 차단된다 (INSERT 정책 부재)');
select lives_ok($$select create_household('새 가구')$$,
  '[11] create_household RPC 로는 생성된다');
select is(
  (select role from household_members hm
     join households h on h.id = hm.household_id
    where h.name='새 가구' and hm.user_id = :'ub'),
  'owner', '[11] RPC 가 가구와 owner 멤버십을 원자적으로 만든다');

-- ═════════════════════════════════════════════════════════════
-- [검증 6] 감사 필드 위조 차단 (AC20, P3)
-- ═════════════════════════════════════════════════════════════
insert into items (id,household_id,location_id,name,created_by,updated_by)
values ('cccc0000-0000-0000-0000-00000000000c', :'hb', :'lb', '위조 테스트', :'ua', :'ua');
select is((select created_by from items where id='cccc0000-0000-0000-0000-00000000000c'), :'ub'::uuid,
  '[6] 클라이언트가 보낸 created_by 를 무시하고 auth.uid() 로 덮어쓴다');
select is((select updated_by from items where id='cccc0000-0000-0000-0000-00000000000c'), :'ub'::uuid,
  '[6] updated_by 도 auth.uid() 로 스탬프된다');

-- ═════════════════════════════════════════════════════════════
-- [검증 7] adjust_item_quantity — 절대값이 아니라 델타 (AC22)
-- ⚠ 진짜 동시성은 두 세션이 필요하므로 셸 스크립트에서 별도 검증한다.
-- ═════════════════════════════════════════════════════════════
select is((select quantity from adjust_item_quantity(:'ib', -1)), 0, '[7] 델타 -1 이 적용된다');
select is((select quantity from adjust_item_quantity(:'ib', 5)),  5, '[7] 델타 +5 가 누적된다');
select is((select quantity from adjust_item_quantity(:'ib', -99)), 0, '[7] 수량은 0 아래로 내려가지 않는다');

-- ═════════════════════════════════════════════════════════════
-- [검증 13] 구매 리스트는 **수량 0** 전이 시에만 편입 (AC16, 2026-08-31 기준 변경)
--   ⚠ 임계치(threshold)는 더 이상 보지 않는다. 컬럼은 남아 있지만 트리거가 무시한다.
-- ═════════════════════════════════════════════════════════════
update items set quantity = 10, threshold = 3 where id = :'ib';
select is((select count(*)::int from shopping_list where item_id = :'ib' and resolved_at is null), 0,
  '[13] 수량이 남아 있으면 구매 리스트에 안 들어간다');

update items set quantity = 3 where id = :'ib';   -- 옛 기준이면 편입됐을 값
select is((select count(*)::int from shopping_list where item_id = :'ib' and resolved_at is null), 0,
  '[13] ⚠ 임계치 이하라도 0 이 아니면 편입하지 않는다 (기준 변경 확인)');

update items set quantity = 0 where id = :'ib';   -- 0 으로 전이
select is((select count(*)::int from shopping_list where item_id = :'ib' and resolved_at is null and added_reason='auto_threshold'), 1,
  '[13] 수량이 0 이 되면 자동 편입된다');

update items set quantity = 0, note = 'touch' where id = :'ib';  -- 이미 0 → 중복 없어야
select is((select count(*)::int from shopping_list where item_id = :'ib' and resolved_at is null), 1,
  '[13] 이미 0 인 상태의 다른 수정은 중복 삽입하지 않는다');

update items set quantity = 2 where id = :'ib';   -- 채워 넣음
select is((select count(*)::int from shopping_list where item_id = :'ib' and resolved_at is null), 0,
  '[13] 채워 넣으면 자동항목이 해제된다');

-- ═════════════════════════════════════════════════════════════
-- [검증 10] soft delete 시 미해결 자동항목 해제
-- (30일 후 하드삭제에서 CASCADE 로 조용히 사라지는 경합 차단)
-- ═════════════════════════════════════════════════════════════
update items set quantity = 0 where id = :'ib';   -- 다시 편입 (0 이어야 한다)
select is((select count(*)::int from shopping_list where item_id = :'ib' and resolved_at is null), 1,
  '[10] 사전 조건: 자동항목이 편입되어 있다');
update items set deleted_at = now() where id = :'ib';
select is((select count(*)::int from shopping_list where item_id = :'ib' and resolved_at is null), 0,
  '[10] soft delete 하면 미해결 자동항목이 해제된다');

-- ═════════════════════════════════════════════════════════════
-- [검증 9] 트리거 실행 순서 + t30 diff 에서 감사 필드 제외 (R17)
-- ═════════════════════════════════════════════════════════════
reset role;
select is(
  (select array_agg(tgname order by tgname)::text
     from pg_trigger where tgrelid='public.items'::regclass and not tgisinternal),
  '{t05_rate_limit,t10_stamp_actor,t20_enforce_container_location,t30_log_item_event,t40_sync_shopping_list,t50_broadcast}',
  '[9] items 트리거가 t05→t50 이름순으로 정렬된다 (실행 순서 = 이름순)');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

update items set note = '메모 변경' where id = :'ia';
select is(
  (select payload ? 'updated_by' or payload ? 'updated_at' from item_events
    where item_id = :'ia' order by id desc limit 1),
  false, '[9] t30 의 diff 에 updated_by/updated_at 이 섞이지 않는다');
select is(
  (select type from item_events where item_id = :'ia' order by id desc limit 1),
  'updated', '[9] 일반 필드 변경은 updated 로 기록된다');

update items set quantity = quantity - 1 where id = :'ia';
select is(
  (select type from item_events where item_id = :'ia' order by id desc limit 1),
  'qty_changed', '[9] 수량 변경은 qty_changed 로 기록된다');

update items set container_id = null where id = :'ia';
select is(
  (select type from item_events where item_id = :'ia' order by id desc limit 1),
  'moved', '[9] 컨테이너 이동은 moved 로 기록된다');

update items set deleted_at = now() where id = :'ia';
select is(
  (select type from item_events where item_id = :'ia' order by id desc limit 1),
  'deleted', '[9] soft delete 는 deleted 로 기록된다');
update items set deleted_at = null where id = :'ia';
select is(
  (select type from item_events where item_id = :'ia' order by id desc limit 1),
  'restored', '[9] 복구는 restored 로 기록된다');

-- ═════════════════════════════════════════════════════════════
-- [검증 20] container ↔ location 일관성 (t20)
-- ═════════════════════════════════════════════════════════════
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into locations (id,household_id,name,created_by,updated_by)
values ('aaaa3333-0000-0000-0000-00000000000a', :'ha', '베란다', :'ua', :'ua');
-- 컨테이너는 팬트리에 있는데 물건의 장소를 베란다로 지정 → 컨테이너 쪽으로 자동 정렬
insert into items (id,household_id,location_id,container_id,name,created_by,updated_by)
values ('aaaa4444-0000-0000-0000-00000000000a', :'ha', 'aaaa3333-0000-0000-0000-00000000000a', :'ca', '불일치 테스트', :'ua', :'ua');
select is((select location_id from items where id='aaaa4444-0000-0000-0000-00000000000a'), :'la'::uuid,
  '[20] 컨테이너와 장소가 불일치하면 컨테이너 쪽 장소로 자동 정렬된다');

-- ═════════════════════════════════════════════════════════════
-- [검증 8] t50_broadcast 예외 격리 (R16)
--
-- 배경 정정: 이 Supabase 버전의 realtime.send 는 **이미 내부에**
--   EXCEPTION WHEN OTHERS THEN RAISE WARNING 을 갖고 있다. 따라서 R16 이 상정한
--   "realtime.messages INSERT 실패 → 원 트랜잭션 롤백"은 Supabase 가 자체 방어한다.
--   우리 래퍼는 2차 방어선이다 — 함수 자체가 없거나(구버전/자체호스팅),
--   권한이 없거나, send 의 자체 핸들러 밖에서 오류가 날 때 의미가 있다.
--
-- 테스트 방식: realtime.send 는 supabase_realtime_admin 소유라 postgres 가
--   rename/replace 할 수 없다. 대신 t50_broadcast(postgres 소유) 본문을
--   **동일한 래퍼 구조로 유지한 채 호출 대상만 없는 함수로** 바꿔 실제 실패를 만든다.
-- ═════════════════════════════════════════════════════════════
reset role;

-- 원본에 예외 핸들러가 실제로 있는지 (구조 검증)
select matches(
  (select lower(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='t50_broadcast'),
  'exception[\s\S]*when others',
  '[8] t50_broadcast 에 EXCEPTION WHEN OTHERS 핸들러가 있다');

select matches(
  (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='t50_broadcast'),
  'realtime\.send',
  '[8] t50_broadcast 가 realtime.send 를 호출한다');

-- 실제 실패를 주입: 래퍼 구조는 그대로, 호출 대상만 없는 함수로
create or replace function public.t50_broadcast()
returns trigger language plpgsql security definer set search_path = public as $bc$
begin
  begin
    perform realtime.send_does_not_exist_for_test(
      jsonb_build_object('table', tg_table_name, 'id', new.id, 'op', lower(tg_op)),
      'change', 'household:' || new.household_id::text, true);
  exception when others then
    null;
  end;
  return new;
end;
$bc$;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  format($$insert into items (id,household_id,location_id,name,created_by,updated_by) values (gen_random_uuid(),%L,%L,'브로드캐스트 장애 중 등록',%L,%L)$$, :'ha', :'la', :'ua', :'ua'),
  '[8] 발행 함수가 존재하지 않아도 items INSERT 가 정상 커밋된다 (R16)');
select is((select count(*)::int from items where name='브로드캐스트 장애 중 등록'), 1,
  '[8] 그 행이 실제로 남아 있다 — 롤백되지 않았다');
reset role;

-- 예외 래퍼가 없으면 정말로 롤백되는지 (대조군)
create or replace function public.t50_broadcast()
returns trigger language plpgsql security definer set search_path = public as $bc$
begin
  perform realtime.send_does_not_exist_for_test('{}'::jsonb, 'change', 'x', true);
  return new;
end;
$bc$;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format($$insert into items (id,household_id,location_id,name,created_by,updated_by) values (gen_random_uuid(),%L,%L,'래퍼 없음',%L,%L)$$, :'ha', :'la', :'ua', :'ua'),
  '42883', null, '[8] 대조군: 래퍼가 없으면 발행 실패가 INSERT 를 실제로 막는다');
reset role;

-- ⚠ 반드시 원본으로 복원한다. 안 그러면 이 뒤의 모든 INSERT 가 깨진 트리거에 걸린다.
create or replace function public.t50_broadcast()
returns trigger language plpgsql security definer set search_path = public as $bc$
begin
  begin
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'id', new.id, 'op', lower(tg_op)),
      'change',
      'household:' || new.household_id::text,
      true
    );
  exception when others then
    null;
  end;
  return new;
end;
$bc$;
select lives_ok(
  format($$insert into items (id,household_id,location_id,name,created_by,updated_by) values (gen_random_uuid(),%L,%L,'복원 확인',%L,%L)$$, :'ha', :'la', :'ua', :'ua'),
  '[8] t50_broadcast 를 원본으로 복원한 뒤 INSERT 가 다시 정상 동작한다');

-- ═════════════════════════════════════════════════════════════
-- [검증 14-0] 정리 작업은 **앱에서 부를 수 없다** (2026-09-01 보안 점검)
-- ═════════════════════════════════════════════════════════════
-- ⚠ 예전에는 `anon` 에게 EXECUTE 가 직접 부여돼 있었고 본문에 신원 검사가
--   없었다. anon 키는 APK 에 들어 있으므로 로그인도 안 한 사람이 전 가구의
--   휴지통을 하드 DELETE 할 수 있었다. 두 겹으로 막았으니 두 겹 다 검사한다.
select ok(not has_function_privilege('anon', 'public.purge_expired_soft_deletes()', 'execute'),
  '[14-0] anon 은 정리 작업을 실행할 권한이 없다');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_soft_deletes()', 'execute'),
  '[14-0] authenticated 도 정리 작업을 실행할 권한이 없다');
select ok(not has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  '[14-0] anon 은 handle_new_user 를 직접 부를 수 없다');
-- rotate_invite 가 SECURITY INVOKER 라 이건 남아 있어야 한다 — 회수하면 코드 바꾸기가 죽는다
select ok(has_function_privilege('authenticated', 'public.gen_invite_code()', 'execute'),
  '[14-0] 반대로 gen_invite_code 는 authenticated 가 계속 부를 수 있다 (rotate_invite 가 INVOKER)');

-- 남의 uuid 를 넣고 활동량을 셀 수 있던 집계 함수도 같이 잠갔다
select ok(not has_function_privilege('anon', 'public.account_deletion_blockers(uuid)', 'execute'),
  '[14-0] anon 은 account_deletion_blockers 를 부를 수 없다');
select ok(not has_function_privilege('authenticated', 'public.account_deletion_blockers(uuid)', 'execute'),
  '[14-0] authenticated 도 account_deletion_blockers 를 부를 수 없다');

-- 권한이 어쩌다 다시 새어도 본문이 거절해야 한다
do $g$
begin
  execute 'grant execute on function public.purge_expired_soft_deletes() to anon';
end;
$g$;
select throws_ok(
  $$select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);
    select purge_expired_soft_deletes()$$,
  '42501', null,
  '[14-0] 권한이 새어도 JWT 를 달고 부르면 본문이 거절한다');
revoke all on function public.purge_expired_soft_deletes() from anon;
-- ⚠ 위 throws_ok 가 클레임을 남긴다. 아래 cron 테스트는 클레임이 없어야 통과한다
select set_config('request.jwt.claims', '', true);

-- ═════════════════════════════════════════════════════════════
-- [검증 14] pg_cron 안전장치 — 대상이 상한을 넘으면 중단 (Architect S4)
-- ═════════════════════════════════════════════════════════════
-- 만료 대상 101건을 인위적으로 만든다
insert into items (id,household_id,location_id,name,created_by,updated_by,deleted_at)
select gen_random_uuid(), :'ha', :'la', '만료 '||g, :'ua', :'ua', now() - interval '40 days'
from generate_series(1,101) g;

select is((select count(*)::int from items where deleted_at is not null and deleted_at < now()-interval '30 days'), 101,
  '[14] 사전 조건: 만료 대상 101건');
select lives_ok($$select purge_expired_soft_deletes()$$, '[14] 정리 작업이 실행된다');
select is((select count(*)::int from items where deleted_at is not null and deleted_at < now()-interval '30 days'), 101,
  '[14] 상한(100) 초과이므로 아무것도 삭제하지 않는다');
select matches(
  (select aborted_reason from maintenance_log order by ran_at desc limit 1),
  '초과하여 중단', '[14] maintenance_log 에 중단 사유가 기록된다');

-- 100건 이하로 줄이면 정상 삭제
delete from items where name like '만료 10%' and deleted_at is not null;
select lives_ok($$select purge_expired_soft_deletes()$$, '[14] 상한 이하에서는 정상 실행된다');
select cmp_ok(
  (select count(*)::int from items where deleted_at is not null and deleted_at < now()-interval '30 days'),
  '=', 0, '[14] 상한 이하일 때 만료분이 삭제된다');

-- ⚠ deleted_at is null 인 행은 절대 지워지면 안 된다
select cmp_ok((select count(*)::int from items where deleted_at is null), '>', 0,
  '[14] 활성 물건은 정리 작업에 영향받지 않는다');

-- ═════════════════════════════════════════════════════════════
-- [검증 R15] rate limit 트리거
-- ═════════════════════════════════════════════════════════════
update app_settings set value='2' where key='items_max_per_household';
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format($$insert into items (id,household_id,location_id,name,created_by,updated_by) values (gen_random_uuid(),%L,%L,'상한 초과',%L,%L)$$, :'ha', :'la', :'ua', :'ua'),
  '23514', null, '[R15] 가구당 물건 수 상한을 넘으면 거부된다');
reset role;
update app_settings set value='10000' where key='items_max_per_household';

-- ═════════════════════════════════════════════════════════════
-- [검증 16] 계정 삭제 경로 (AC29 — App Store 필수 요건)
--
-- 원격에서 실제로 계정을 지워보다 발견: auth.users 삭제가 profiles 로 cascade 되는데
-- 행위자 FK 들이 참조하고 있어 23503 으로 막혔다. 로컬 SQL 테스트는 사용자 삭제를
-- 시도하지 않아 이 경로를 놓쳤다. 이제 두 방향을 모두 고정한다.
-- ═════════════════════════════════════════════════════════════
reset role;

-- (A) 행위자 참조는 SET NULL 이어야 한다
select is(
  (select confdeltype::text from pg_constraint where conname = 'item_events_actor_id_fkey'),
  'n', '[16] item_events.actor_id 는 ON DELETE SET NULL 이다');
select is(
  (select confdeltype::text from pg_constraint where conname = 'shopping_list_resolved_by_fkey'),
  'n', '[16] shopping_list.resolved_by 는 ON DELETE SET NULL 이다');

-- (B) 소유 참조는 삭제를 막아야 한다 — 그래야 감사 이력이 안 사라진다
select cmp_ok(
  (select sum(cnt)::int from account_deletion_blockers(:'ua')),
  '>', 0, '[16] 데이터를 만든 사용자는 삭제 차단 대상으로 잡힌다 (익명화 필요)');

-- ⚠ 이 검사는 2026-08-31 에 형태가 바뀌었다. 지키려는 것은 그대로다 —
--    **감사 이력이 사람을 지운다고 사라지면 안 된다.**
--
--    전에는 `profiles.id → auth.users ON DELETE CASCADE` 라서 인증 계정을 지우면
--    프로필까지 지워지려다 소유 FK 에 걸려 23503 이 났고, 그 사실 자체를 검사했다.
--    그런데 그건 "탈퇴가 불가능하다" 는 뜻이기도 했다. 탈퇴 기능(M9)을 만들면서
--    그 FK 를 끊었다 — 이제 인증 계정만 지우고 프로필은 익명화해 남긴다.
--
--    그래서 검사도 **진짜 지키려던 것**으로 바꾼다: 인증 계정을 지워도 프로필은
--    살아남고, 프로필을 직접 지우는 것은 여전히 막힌다.
select lives_ok(
  format($$delete from auth.users where id = %L$$, :'ua'),
  '[16] 인증 계정은 지울 수 있다 (탈퇴가 가능해야 한다)');
select is(
  (select count(*)::int from profiles where id = :'ua'),
  1, '[16] 인증 계정을 지워도 프로필 행은 남는다 — 감사 이력이 물려 있다');
select throws_ok(
  format($$delete from profiles where id = %L$$, :'ua'),
  '23503', null, '[16] 프로필 직접 삭제는 여전히 막힌다 → 지우지 말고 익명화해야 한다');

-- 데이터를 만든 적 없는 사용자는 깨끗이 지워진다
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('deadbeef-0000-0000-0000-00000000dead','00000000-0000-0000-0000-000000000000','authenticated','authenticated','clean@test.io','x',now(),now());
select is((select sum(cnt)::int from account_deletion_blockers('deadbeef-0000-0000-0000-00000000dead')), 0,
  '[16] 데이터가 없는 사용자는 차단 요소가 0이다');
select lives_ok(
  $$delete from auth.users where id = 'deadbeef-0000-0000-0000-00000000dead'$$,
  '[16] 데이터가 없는 사용자는 하드 삭제가 된다');

-- ═════════════════════════════════════════════════════════════
-- [검증 17] soft delete 계층 무결성 (M3)
-- FK 의 ON DELETE 절은 하드 삭제에만 발동한다. soft delete 만 쓰는 우리는
-- 트리거로 직접 강제해야 한다.
-- ═════════════════════════════════════════════════════════════
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

insert into locations (id, household_id, name, created_by, updated_by)
values ('17aa0000-0000-0000-0000-00000000001a', :'ha', 'M3 장소', :'ua', :'ua');
insert into containers (id, household_id, location_id, name, created_by, updated_by)
values ('17bb0000-0000-0000-0000-00000000001b', :'ha', '17aa0000-0000-0000-0000-00000000001a', 'M3 박스', :'ua', :'ua');
insert into items (id, household_id, location_id, container_id, name, created_by, updated_by)
values ('17cc0000-0000-0000-0000-00000000001c', :'ha', '17aa0000-0000-0000-0000-00000000001a',
        '17bb0000-0000-0000-0000-00000000001b', 'M3 물건', :'ua', :'ua');

-- 하위가 있는 장소는 삭제가 막힌다
select throws_ok(
  $$update locations set deleted_at = now() where id = '17aa0000-0000-0000-0000-00000000001a'$$,
  '23514', null, '[17] 하위가 남은 장소는 soft delete 가 거부된다');

-- 컨테이너를 지우면 물건은 살아서 장소 직속이 된다
update containers set deleted_at = now() where id = '17bb0000-0000-0000-0000-00000000001b';
select is((select count(*)::int from items where id = '17cc0000-0000-0000-0000-00000000001c' and deleted_at is null),
  1, '[17] 컨테이너를 지워도 물건은 사라지지 않는다 (M3 완료조건)');
select is((select container_id from items where id = '17cc0000-0000-0000-0000-00000000001c'),
  null, '[17] 물건이 장소 직속으로 분리된다');
select is((select location_id from items where id = '17cc0000-0000-0000-0000-00000000001c'),
  '17aa0000-0000-0000-0000-00000000001a'::uuid, '[17] 장소는 그대로 유지된다');
select is((select type from item_events where item_id = '17cc0000-0000-0000-0000-00000000001c' order by id desc limit 1),
  'moved', '[17] 분리가 moved 이벤트로 기록된다 (AC21)');

-- 물건까지 지우면 그제서야 장소를 지울 수 있다
update items set deleted_at = now() where id = '17cc0000-0000-0000-0000-00000000001c';
select lives_ok(
  $$update locations set deleted_at = now() where id = '17aa0000-0000-0000-0000-00000000001a'$$,
  '[17] 비운 장소는 soft delete 가 된다');

-- 요약 뷰는 삭제된 것을 세지 않는다
select is((select count(*)::int from location_summary where id = '17aa0000-0000-0000-0000-00000000001a'),
  0, '[17] location_summary 는 삭제된 장소를 제외한다');
select is((select count(*)::int from container_summary where id = '17bb0000-0000-0000-0000-00000000001b'),
  0, '[17] container_summary 는 삭제된 컨테이너를 제외한다');

-- 요약 뷰도 RLS 를 탄다 (뷰가 우회로가 되면 안 된다)
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from location_summary where household_id = :'hb'), 1,
  '[17] 자기 가구 요약은 보인다');
reset role;

-- [AC10] 컨테이너마다 서로 다른 QR 토큰이 자동 발급된다
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into containers (household_id, location_id, name, created_by, updated_by)
select :'ha', :'la', '박스 ' || g, :'ua', :'ua' from generate_series(1, 10) g;
select is((select count(distinct qr_token)::int from containers where household_id = :'ha' and name like '박스 %'),
  10, '[AC10] 박스 10개에 서로 다른 QR 토큰이 자동 발급된다');
select is((select count(*)::int from containers where household_id = :'ha' and name like '박스 %' and qr_token is null),
  0, '[AC10] QR 토큰이 비어 있는 컨테이너가 없다');
reset role;

-- ═════════════════════════════════════════════════════════════
-- [카테고리] 삭제해도 물건이 사라지지 않는다 (2026-08-31, R-C1)
--
-- ⚠ 이 프로젝트에서 가장 위험한 회귀 지점이다. items.category_id 의 참조를
--   CASCADE 로 바꾸면 카테고리 하나를 지울 때 물건 수십 개가 함께 사라진다.
--   실수는 마이그레이션 한 줄이고, 사용자는 되돌릴 수 없다.
--
-- ⚠ 이 블록은 **자립적이다.** 앞선 테스트들이 픽스처를 바꿔 놓으므로
--   "가구 A 에 물건이 1개" 같은 전역 상태를 가정하지 않는다 —
--   처음에 그렇게 썼다가 실제로 4개여서 실패했다. 자기 물건을 만들어 그것만 센다.
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', json_build_object('sub', :'ua', 'role','authenticated')::text, true);
set local role authenticated;

insert into categories (id, household_id, name) values
  ('ccccaaaa-0000-0000-0000-00000000000a', :'ha', '화장품');

insert into items (id, household_id, location_id, container_id, name, category_id)
values ('caca0001-0000-0000-0000-00000000000a', :'ha', :'la', null, '카테고리 테스트 물건',
        'ccccaaaa-0000-0000-0000-00000000000a');

select is((select category_id from items where id = 'caca0001-0000-0000-0000-00000000000a'),
  'ccccaaaa-0000-0000-0000-00000000000a'::uuid,
  '[카테고리] 물건에 카테고리가 붙는다');

delete from categories where id = 'ccccaaaa-0000-0000-0000-00000000000a';

select is((select count(*)::int from items where id = 'caca0001-0000-0000-0000-00000000000a'), 1,
  '[카테고리] ⚠ 카테고리를 지워도 **물건이 그대로 남는다** (ON DELETE SET NULL)');
select is((select category_id from items where id = 'caca0001-0000-0000-0000-00000000000a'), null,
  '[카테고리] 카테고리를 지우면 물건의 분류만 비워진다');

-- FK 규칙 자체를 구조적으로도 못박는다 — 나중에 누가 CASCADE 로 바꾸면 여기서 걸린다
select is(
  (select confdeltype::text from pg_constraint where conname = 'items_category_id_fkey'),
  'n', '[카테고리] items.category_id 는 ON DELETE SET NULL 이다 (n = SET NULL)');

-- 이름 중복 차단 (C5). 대소문자·앞뒤 공백을 무시한다
insert into categories (household_id, name) values (:'ha', '여행용품');
select throws_ok(
  $$insert into categories (household_id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', ' 여행용품 ')$$,
  '23505', null, '[카테고리] 같은 이름은 앞뒤 공백을 달아도 다시 만들 수 없다');

-- RLS 가 실제로 켜져 있는지 (M1 의 R18 — enable 만 하고 정책을 빠뜨리는 실수)
select is((select relrowsecurity from pg_class where relname = 'categories'), true,
  '[카테고리] categories 에 RLS 가 켜져 있다');
select is((select count(*)::int from pg_policies where tablename = 'categories'), 4,
  '[카테고리] categories 에 4개 정책이 있다 (select/insert/update/delete)');
reset role;


select * from finish();
rollback;
