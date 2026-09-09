-- 홈 스토어 — 사진 파일이 고아가 되지 않는다 (2026-09-08)
--
-- 고정하려는 것:
--   (1) 사진 행을 지우면 원본·썸네일 경로가 수거 큐에 들어간다 (클라이언트 삭제가 실패해도 남지 않는다)
--   (2) 박스 사진을 바꾸면 옛 경로가, 떼면 옛 경로가 큐에 들어간다
--   (3) 같은 경로로 덮어쓰면 큐에 넣지 않는다 (살아 있는 파일을 지우면 안 된다)
--   (4) 물건이 하드 삭제될 때 CASCADE 로 지워지는 사진 행도 큐에 들어간다 — purge 가 넣는 것과 겹쳐도 한 번만
--   (5) 가구가 통째로 지워질 때(탈퇴 CASCADE)는 큐에 넣지 않고, 삭제도 막히지 않는다
--   (6) 큐의 항목은 그 가구 구성원에게만 보인다 (RLS 그대로)

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ua 'd0000000-0000-0000-0000-000000000001'
\set ub 'd0000000-0000-0000-0000-000000000002'
\set ha 'd0000001-0000-0000-0000-00000000000a'
\set hb 'd0000001-0000-0000-0000-00000000000b'
\set la 'd0000002-0000-0000-0000-00000000000a'
\set lb 'd0000002-0000-0000-0000-00000000000b'
\set ca 'd0000003-0000-0000-0000-00000000000a'
\set ia 'd0000004-0000-0000-0000-00000000000a'
\set ib 'd0000004-0000-0000-0000-00000000000b'
\set p1 'd0000005-0000-0000-0000-000000000001'
\set p2 'd0000005-0000-0000-0000-000000000002'
\set pb 'd0000005-0000-0000-0000-00000000000b'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@gc2.test','x',now(),now(),'{"full_name":"에이"}'),
  (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@gc2.test','x',now(),now(),'{"full_name":"비"}');
insert into households (id, name, created_by) values (:'ha','집A',:'ua'), (:'hb','집B',:'ub');
insert into household_members (household_id, user_id, role) values (:'ha',:'ua','owner'), (:'hb',:'ub','owner');
insert into locations (id, household_id, name, created_by, updated_by) values
  (:'la',:'ha','창고',:'ua',:'ua'), (:'lb',:'hb','창고',:'ub',:'ub');
insert into containers (id, household_id, location_id, name, photo_path, thumb_path, created_by, updated_by) values
  (:'ca',:'ha',:'la','박스','ha/ca/v1.jpg','ha/ca/v1_t.jpg',:'ua',:'ua');
insert into items (id, household_id, location_id, name, created_by, updated_by) values
  (:'ia',:'ha',:'la','내 물건',:'ua',:'ua'),
  (:'ib',:'hb',:'lb','남의 물건',:'ub',:'ub');
insert into item_photos (id, household_id, item_id, photo_path, thumb_path, sort_order, created_by) values
  (:'p1',:'ha',:'ia','ha/ia/p1.jpg','ha/ia/p1_t.jpg',0,:'ua'),
  (:'p2',:'ha',:'ia','ha/ia/p2.jpg','ha/ia/p2_t.jpg',1,:'ua'),
  (:'pb',:'hb',:'ib','hb/ib/pb.jpg','hb/ib/pb_t.jpg',0,:'ub');

-- ─────────────────────────────────────────────────────────────
-- (1) 나(에이)로 사진 한 장 떼기 — 클라이언트가 지우는 것과 같은 경로
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

delete from item_photos where id = :'p2';
select is((select count(*)::int from storage_gc where path in ('ha/ia/p2.jpg','ha/ia/p2_t.jpg')), 2,
  '(1) 사진 행을 지우면 원본·썸네일이 수거 큐에 들어간다');
select is((select count(*)::int from storage_gc where household_id = :'ha'), 2,
  '(1) 남은 장(p1)의 경로는 큐에 없다');
select is((select photo_path from items where id = :'ia'), 'ha/ia/p1.jpg', '(1) 대표는 남은 장으로 (t61 그대로)');

-- (2) 박스 사진 교체 → 옛 경로가 큐에
update containers set photo_path = 'ha/ca/v2.jpg', thumb_path = 'ha/ca/v2_t.jpg' where id = :'ca';
select ok(
  (select count(*) = 2 from storage_gc where path in ('ha/ca/v1.jpg','ha/ca/v1_t.jpg')),
  '(2) 박스 사진을 바꾸면 옛 원본·썸네일이 큐에 들어간다');
select ok(
  (select count(*) = 0 from storage_gc where path in ('ha/ca/v2.jpg','ha/ca/v2_t.jpg')),
  '(2) 새 경로는 큐에 들어가지 않는다');

-- (3) 같은 경로로 덮어쓰기(다른 컬럼만 바뀜) → 아무것도 안 넣는다
update containers set note = '메모' where id = :'ca';
update containers set photo_path = 'ha/ca/v2.jpg', thumb_path = 'ha/ca/v2_t.jpg' where id = :'ca';
select is((select count(*)::int from storage_gc where household_id = :'ha'), 4,
  '(3) 경로가 그대로면 큐에 아무것도 안 들어간다');

-- (2) 박스 사진 떼기 → 옛 경로가 큐에
update containers set photo_path = null, thumb_path = null where id = :'ca';
select ok(
  (select count(*) = 2 from storage_gc where path in ('ha/ca/v2.jpg','ha/ca/v2_t.jpg')),
  '(2) 박스 사진을 떼면 옛 경로가 큐에 들어간다');

-- (6) 남의 가구에서는 안 보인다
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from storage_gc where household_id = :'ha'), 0, '(6) 남의 가구 큐는 보이지 않는다');

reset role;
reset request.jwt.claims;

-- ─────────────────────────────────────────────────────────────
-- (4) 물건 하드 삭제 — purge 가 넣는 것과 CASCADE 트리거가 넣는 것이 겹쳐도 한 번
-- ─────────────────────────────────────────────────────────────
update items set deleted_at = now() - interval '40 days' where id = :'ia';
select public.purge_expired_soft_deletes();
select is((select count(*)::int from items where id = :'ia'), 0, '(4) 물건은 지워졌다');
select is((select count(*)::int from storage_gc where path in ('ha/ia/p1.jpg','ha/ia/p1_t.jpg')), 2,
  '(4) CASCADE 로 지워진 사진 행의 경로가 큐에 있다 (중복 없이 한 번)');

-- ─────────────────────────────────────────────────────────────
-- (5) 가구 통째로 삭제 — 트리거가 FK 를 튕기게 하면 안 된다
-- ─────────────────────────────────────────────────────────────
select lives_ok(
  $$delete from households where id = 'd0000001-0000-0000-0000-00000000000b'$$,
  '(5) 가구 CASCADE 삭제가 사진 트리거 때문에 막히지 않는다');
select is((select count(*)::int from storage_gc where path like 'hb/%'), 0,
  '(5) 사라진 가구의 경로는 큐에 넣지 않는다 (탈퇴·휴면 흐름이 이미 들고 있다)');

select * from finish();
rollback;
