-- 홈 스토어 — 휴면 집 파기 (2026-09-02)
--
-- 이 기능은 **사용자 데이터를 통째로 지운다.** 잘못 돌면 되돌릴 방법이 없으므로
-- 위험한 갈래를 하나씩 못박는다.
--
--   (1) 90일 안 들어온 집만 휴면이 된다 (89일은 아니다)
--   (2) 접속하면 휴면·예고 표시가 **지워진다** — 이 기능 최악의 실수는
--       "돌아온 사람의 집을 지우는 것" 이다
--   (3) 예고 대상은 휴면 30일이 지난 집. 관리자 **전원**의 메일을 준다
--   (4) 메일이 나가기 전에는 warned_at 이 비어 있다 (예고 없이 지우지 않는다)
--   (5) 삭제 대상은 예고 30일이 지난 집. 사진 경로를 함께 준다
--   (6) delete 는 목록을 **그대로 믿지 않고** 조건을 다시 본다 —
--       목록을 뽑은 뒤 누가 접속했으면 지우면 안 된다
--   (7) 상한을 넘으면 중단하고 사유를 남긴다
--   (8) 일반 사용자는 이 함수들을 **부를 수 없다**
--   (9) 집을 지우면 가족·물건·사진 경로까지 함께 사라진다

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner1@dorm.test','x',now(),now(),'{"full_name":"주인1"}'),
  ('e0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner2@dorm.test','x',now(),now(),'{"full_name":"주인2"}'),
  ('e0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fam@dorm.test','x',now(),now(),'{"full_name":"가족"}');

-- 집: 활동중 / 89일 / 91일 / 휴면31일 / 예고31일
insert into households (id, name, created_by, last_seen_at) values
  ('e0000001-0000-0000-0000-00000000000a','활동중','e0000000-0000-0000-0000-000000000001', now()),
  ('e0000001-0000-0000-0000-00000000000b','89일',  'e0000000-0000-0000-0000-000000000001', now() - interval '89 days'),
  ('e0000001-0000-0000-0000-00000000000c','91일',  'e0000000-0000-0000-0000-000000000001', now() - interval '91 days'),
  ('e0000001-0000-0000-0000-00000000000d','휴면31','e0000000-0000-0000-0000-000000000001', now() - interval '121 days'),
  ('e0000001-0000-0000-0000-00000000000e','예고31','e0000000-0000-0000-0000-000000000001', now() - interval '151 days');

update households set dormant_since = now() - interval '31 days' where id = 'e0000001-0000-0000-0000-00000000000d';
update households set dormant_since = now() - interval '61 days',
                      warned_at     = now() - interval '31 days' where id = 'e0000001-0000-0000-0000-00000000000e';

-- 관리자 둘 + 일반 구성원 하나 (예고 메일은 관리자 전원에게)
insert into household_members (household_id, user_id, role) values
  ('e0000001-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000001','owner'),
  ('e0000001-0000-0000-0000-00000000000b','e0000000-0000-0000-0000-000000000001','owner'),
  ('e0000001-0000-0000-0000-00000000000c','e0000000-0000-0000-0000-000000000001','owner'),
  ('e0000001-0000-0000-0000-00000000000d','e0000000-0000-0000-0000-000000000001','owner'),
  ('e0000001-0000-0000-0000-00000000000d','e0000000-0000-0000-0000-000000000002','owner'),
  ('e0000001-0000-0000-0000-00000000000d','e0000000-0000-0000-0000-000000000003','member'),
  ('e0000001-0000-0000-0000-00000000000e','e0000000-0000-0000-0000-000000000001','owner');

-- 지워질 집(예고31)에 물건과 사진, 그리고 아직 안 비운 수거 큐
insert into locations (id, household_id, name, created_by, updated_by) values
  ('e0000002-0000-0000-0000-00000000000e','e0000001-0000-0000-0000-00000000000e','창고',
   'e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001');
insert into items (id, household_id, location_id, name, photo_path, thumb_path, created_by, updated_by) values
  ('e0000003-0000-0000-0000-00000000000e','e0000001-0000-0000-0000-00000000000e','e0000002-0000-0000-0000-00000000000e','낡은 물건',
   'hh-e/item/v.jpg','hh-e/item/v_t.jpg','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001');
insert into storage_gc (path, household_id) values
  ('hh-e/queued/old.jpg','e0000001-0000-0000-0000-00000000000e');

-- ─────────────────────────────────────────────────────────────
-- (8) 일반 사용자는 부를 수 없다
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.mark_dormant_households()$$, '42501', null,
  '(8) 일반 사용자는 휴면 표시를 부를 수 없다');
select throws_ok($$select * from public.dormant_households_to_delete()$$, '42501', null,
  '(8) 일반 사용자는 삭제 대상 목록을 볼 수 없다');
select throws_ok($$select public.delete_dormant_households(array['e0000001-0000-0000-0000-00000000000e'::uuid])$$,
  '42501', null, '(8) 일반 사용자는 집을 지울 수 없다');
reset role;
reset request.jwt.claims;

-- ─────────────────────────────────────────────────────────────
-- (1) 90일 경계
-- ─────────────────────────────────────────────────────────────
-- ⚠ 픽스처에서 '휴면31'·'예고31' 은 이미 dormant_since 가 채워져 있다. 새로 표시되는
--   것은 91일짜리 하나뿐이다 — 이미 휴면인 집을 다시 표시하면 시계가 되감긴다.
select is(public.mark_dormant_households(), 1, '(1) 아직 표시 안 된 91일짜리 한 곳만 새로 휴면이 된다');
select isnt((select dormant_since from households where id = 'e0000001-0000-0000-0000-00000000000c'),
  null, '(1) 91일 된 집이 휴면으로 표시됐다');
select is(
  (select dormant_since::date from households where id = 'e0000001-0000-0000-0000-00000000000d'),
  (now() - interval '31 days')::date,
  '(1) 이미 휴면인 집의 시각은 **그대로다** — 다시 표시하면 삭제 시계가 되감긴다');
select is((select dormant_since is null from households where id = 'e0000001-0000-0000-0000-00000000000b'),
  true, '(1) 89일 된 집은 아직 휴면이 아니다');
select is((select dormant_since is null from households where id = 'e0000001-0000-0000-0000-00000000000a'),
  true, '(1) 활동중인 집은 휴면이 아니다');

-- ─────────────────────────────────────────────────────────────
-- (2) 돌아오면 표시가 지워진다 — 이 기능 최악의 실수를 막는 자리
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.touch_household('e0000001-0000-0000-0000-00000000000e');
reset role;
reset request.jwt.claims;
select is(
  (select (dormant_since is null and warned_at is null) from households where id = 'e0000001-0000-0000-0000-00000000000e'),
  true, '(2) 접속하면 휴면·예고 표시가 모두 지워진다');
select is(
  (select count(*)::int from public.dormant_households_to_delete() where household_id = 'e0000001-0000-0000-0000-00000000000e'),
  0, '(2) 그러므로 삭제 대상에서도 빠진다');

-- 남의 집은 못 만진다
set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}';
select public.touch_household('e0000001-0000-0000-0000-00000000000c');
reset role;
reset request.jwt.claims;
select isnt(
  (select dormant_since from households where id = 'e0000001-0000-0000-0000-00000000000c'),
  null, '(2) 구성원이 아니면 남의 집 접속 시각을 올릴 수 없다');

-- 되돌려 놓고 계속한다
update households set dormant_since = now() - interval '61 days',
                      warned_at     = now() - interval '31 days',
                      last_seen_at  = now() - interval '151 days'
 where id = 'e0000001-0000-0000-0000-00000000000e';

-- ─────────────────────────────────────────────────────────────
-- (3)(4) 예고
-- ─────────────────────────────────────────────────────────────
select bag_eq(
  $$select household_id from public.dormant_households_to_warn()$$,
  $$values ('e0000001-0000-0000-0000-00000000000d'::uuid)$$,
  '(3) 휴면 30일이 지난 집만 예고 대상이다 (방금 휴면이 된 집은 아니다)'
);
select bag_eq(
  $$select unnest(emails) from public.dormant_households_to_warn()$$,
  $$values ('owner1@dorm.test'),('owner2@dorm.test')$$,
  '(3) 관리자 전원에게 보낸다 — 한 명만 보내면 그 사람이 못 볼 때 집이 사라진다'
);
select is(
  (select count(*)::int from public.dormant_households_to_warn() where 'fam@dorm.test' = any(emails)),
  0, '(3) 일반 구성원은 예고 대상이 아니다');
select is(
  (select warned_at is null from households where id = 'e0000001-0000-0000-0000-00000000000d'),
  true, '(4) 목록을 뽑았다고 예고한 것이 되지는 않는다 — 메일이 나간 뒤에 표시한다');

select is(public.mark_household_warned(array['e0000001-0000-0000-0000-00000000000d'::uuid]), 1,
  '(4) 메일 발송 뒤 표시한다');
select is((select count(*)::int from public.dormant_households_to_warn()), 0,
  '(4) 표시한 집은 다시 예고 대상이 되지 않는다 (중복 발송 없음)');

-- ─────────────────────────────────────────────────────────────
-- (5) 삭제 대상과 사진 경로
-- ─────────────────────────────────────────────────────────────
select bag_eq(
  $$select household_id from public.dormant_households_to_delete()$$,
  $$values ('e0000001-0000-0000-0000-00000000000e'::uuid)$$,
  '(5) 예고 30일이 지난 집만 삭제 대상이다'
);
select bag_eq(
  $$select unnest(paths) from public.dormant_households_to_delete()$$,
  $$values ('hh-e/item/v.jpg'),('hh-e/item/v_t.jpg'),('hh-e/queued/old.jpg')$$,
  '(5) 물건 사진과 **아직 안 비운 수거 큐**까지 함께 준다 — 지우면 경로를 잃는다'
);

-- ─────────────────────────────────────────────────────────────
-- (6) 목록을 그대로 믿지 않는다
-- ─────────────────────────────────────────────────────────────
select is(
  public.delete_dormant_households(array['e0000001-0000-0000-0000-00000000000a'::uuid]),
  0, '(6) 활동중인 집을 목록에 넣어 불러도 지워지지 않는다');
select is(
  (select count(*)::int from households where id = 'e0000001-0000-0000-0000-00000000000a'),
  1, '(6) 그 집은 그대로 있다');

-- ─────────────────────────────────────────────────────────────
-- (7) 상한
-- ─────────────────────────────────────────────────────────────
update app_settings set value = '0' where key = 'dormant_delete_abort_over';
select is(
  public.delete_dormant_households(array['e0000001-0000-0000-0000-00000000000e'::uuid]),
  0, '(7) 상한을 넘으면 한 곳도 지우지 않는다');
select isnt(
  (select aborted_reason from maintenance_log where job = 'delete_dormant_households' order by id desc limit 1),
  null, '(7) 중단 사유가 남는다');
update app_settings set value = '50' where key = 'dormant_delete_abort_over';

-- ─────────────────────────────────────────────────────────────
-- (9) 실제 삭제 — 딸린 것이 전부 사라진다
-- ─────────────────────────────────────────────────────────────
select is(
  public.delete_dormant_households(array['e0000001-0000-0000-0000-00000000000e'::uuid]),
  1, '(9) 조건을 만족하는 집은 지워진다');
select is((select count(*)::int from households  where id = 'e0000001-0000-0000-0000-00000000000e'), 0, '(9) 집');
select is((select count(*)::int from household_members where household_id = 'e0000001-0000-0000-0000-00000000000e'), 0, '(9) 가족');
select is((select count(*)::int from items      where household_id = 'e0000001-0000-0000-0000-00000000000e'), 0, '(9) 물건');
select is((select count(*)::int from locations  where household_id = 'e0000001-0000-0000-0000-00000000000e'), 0, '(9) 장소');
-- ⚠ 수거 큐는 **살아남아야** 한다. 파일을 지우려면 경로가 필요하다.
select is((select count(*)::int from storage_gc where household_id = 'e0000001-0000-0000-0000-00000000000e'), 1,
  '(9) 수거 큐는 집이 사라져도 남는다 — FK 를 일부러 끊어 뒀다');
-- 계정 자체는 남는다. 다른 집에 속해 있을 수 있다.
select is((select count(*)::int from auth.users where id = 'e0000000-0000-0000-0000-000000000001'), 1,
  '(9) 집을 지워도 사람의 계정은 지우지 않는다');

select * from finish();
rollback;
