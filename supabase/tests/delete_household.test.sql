-- 홈 스토어 — 공간 삭제 (2026-09-12)
--
-- 고정하려는 것:
--   (1) 미리보기가 물건 수·구성원 수·사진 경로(물건 원본+썸네일, 박스)를 정확히 준다
--   (2) 구성원·비멤버·익명은 미리보기도 삭제도 못 한다 (42501)
--   (3) 관리자가 지우면 가구와 그 아래 전부(구성원·장소·박스·물건·사진행·초대·GC큐)가 사라진다
--   (4) 다른 가구는 건드리지 않는다

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','own@dh.test','x',now(),now(),'{"full_name":"주인"}'),
  ('e0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mem@dh.test','x',now(),now(),'{"full_name":"구성원"}'),
  ('e0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@dh.test','x',now(),now(),'{"full_name":"바깥"}');

insert into households (id, name, created_by) values
  ('e0000001-0000-0000-0000-00000000000a','지울집','e0000000-0000-0000-0000-000000000001'),
  ('e0000001-0000-0000-0000-00000000000b','남는집','e0000000-0000-0000-0000-000000000001');
insert into household_members (household_id, user_id, role) values
  ('e0000001-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000001','owner'),
  ('e0000001-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-000000000002','member'),
  ('e0000001-0000-0000-0000-00000000000b','e0000000-0000-0000-0000-000000000001','owner');
insert into invites (id, household_id, code, created_by) values
  ('e0000002-0000-0000-0000-00000000000a','e0000001-0000-0000-0000-00000000000a','DELCODE1','e0000000-0000-0000-0000-000000000001');

insert into locations (id, household_id, name, created_by, updated_by) values
  ('e0000003-0000-0000-0000-00000000000a','e0000001-0000-0000-0000-00000000000a','창고','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001'),
  ('e0000003-0000-0000-0000-00000000000b','e0000001-0000-0000-0000-00000000000b','거실','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001');
insert into containers (id, household_id, location_id, name, photo_path, thumb_path, created_by, updated_by) values
  ('e0000004-0000-0000-0000-00000000000a','e0000001-0000-0000-0000-00000000000a','e0000003-0000-0000-0000-00000000000a','박스','a/box.jpg','a/box_t.jpg','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001');
insert into items (id, household_id, location_id, container_id, name, created_by, updated_by) values
  ('e0000005-0000-0000-0000-00000000000a','e0000001-0000-0000-0000-00000000000a','e0000003-0000-0000-0000-00000000000a','e0000004-0000-0000-0000-00000000000a','물건1','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001'),
  ('e0000005-0000-0000-0000-00000000000c','e0000001-0000-0000-0000-00000000000a','e0000003-0000-0000-0000-00000000000a',null,'물건2','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001'),
  ('e0000005-0000-0000-0000-00000000000b','e0000001-0000-0000-0000-00000000000b','e0000003-0000-0000-0000-00000000000b',null,'남는물건','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001');
insert into item_photos (id, household_id, item_id, photo_path, thumb_path, sort_order, created_by) values
  ('e0000006-0000-0000-0000-00000000000a','e0000001-0000-0000-0000-00000000000a','e0000005-0000-0000-0000-00000000000a','a/p1.jpg','a/p1_t.jpg',0,'e0000000-0000-0000-0000-000000000001');
-- GC 큐에도 하나 — 가구와 함께 사라져야 한다 (FK CASCADE)
insert into storage_gc (path, household_id) values ('a/old.jpg','e0000001-0000-0000-0000-00000000000a');

-- ─── (1) 미리보기 ───────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((household_deletion_preview('e0000001-0000-0000-0000-00000000000a') ->> 'item_count')::int, 2, '(1) 물건 2개');
select is((household_deletion_preview('e0000001-0000-0000-0000-00000000000a') ->> 'member_count')::int, 2, '(1) 구성원 2명');
select is(
  (select array_agg(p order by p collate "C") from jsonb_array_elements_text(
      household_deletion_preview('e0000001-0000-0000-0000-00000000000a') -> 'photo_paths') as p),
  array['a/box.jpg','a/box_t.jpg','a/old.jpg','a/p1.jpg','a/p1_t.jpg'],
  '(1) 물건 원본·썸네일, 박스 사진, GC 큐의 옛 파일 경로가 모두 있다');

-- ─── (2) 권한 ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select household_deletion_preview('e0000001-0000-0000-0000-00000000000a')$$, '42501', null, '(2) 구성원은 미리보기도 못 한다');
select throws_ok($$select delete_household('e0000001-0000-0000-0000-00000000000a')$$, '42501', null, '(2) 구성원은 못 지운다');

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$select delete_household('e0000001-0000-0000-0000-00000000000a')$$, '42501', null, '(2) 비멤버는 못 지운다');

reset role;
set local role anon;
select throws_ok($$select delete_household('e0000001-0000-0000-0000-00000000000a')$$, '42501', null, '(2) 익명은 부를 수 없다');
reset role;

select is((select count(*)::int from households where id = 'e0000001-0000-0000-0000-00000000000a'), 1, '(2) 거부된 호출은 아무것도 지우지 않았다');

-- ─── (3) 관리자가 지운다 ───────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select delete_household('e0000001-0000-0000-0000-00000000000a')$$, '(3) 관리자는 지울 수 있다');
reset role;

select is((select count(*)::int from households        where id = 'e0000001-0000-0000-0000-00000000000a'), 0, '(3) 가구가 사라졌다');
select is((select count(*)::int from household_members where household_id = 'e0000001-0000-0000-0000-00000000000a'), 0, '(3) 구성원이 사라졌다');
select is((select count(*)::int from locations         where household_id = 'e0000001-0000-0000-0000-00000000000a'), 0, '(3) 장소가 사라졌다');
select is((select count(*)::int from containers        where household_id = 'e0000001-0000-0000-0000-00000000000a'), 0, '(3) 박스가 사라졌다');
select is((select count(*)::int from items             where household_id = 'e0000001-0000-0000-0000-00000000000a'), 0, '(3) 물건이 사라졌다');
select is((select count(*)::int from item_photos       where household_id = 'e0000001-0000-0000-0000-00000000000a'), 0, '(3) 사진 행이 사라졌다');
select is((select count(*)::int from invites           where household_id = 'e0000001-0000-0000-0000-00000000000a'), 0, '(3) 초대 코드가 사라졌다');
select is((select count(*)::int from storage_gc        where household_id = 'e0000001-0000-0000-0000-00000000000a'), 0, '(3) GC 큐가 사라졌다');

-- ─── (4) 다른 가구는 그대로 ───────────────────────────────
select is((select count(*)::int from households where id = 'e0000001-0000-0000-0000-00000000000b'), 1, '(4) 남는집은 그대로');
select is((select count(*)::int from items where household_id = 'e0000001-0000-0000-0000-00000000000b'), 1, '(4) 남는집 물건도 그대로');
select is((select count(*)::int from household_members where user_id = 'e0000000-0000-0000-0000-000000000001'), 1, '(4) 주인은 남는집 구성원으로 남아 있다');

select * from finish();
rollback;
