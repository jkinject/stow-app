-- 홈 스토어 — 사진 파일 수거 큐 (2026-09-02)
--
-- 고정하려는 것:
--   (1) 30일 지난 물건을 하드 삭제하기 **전에** 사진 경로가 큐에 들어간다
--   (2) 사진이 없는 물건은 큐에 아무것도 안 남긴다
--   (3) 아직 안 지워질 물건(30일 미만)의 사진은 큐에 안 들어간다
--   (4) 안의 물건 때문에 못 지우는 박스의 사진도 큐에 안 들어간다 — 지워지는 것과
--       큐에 들어가는 것이 어긋나면, 살아 있는 박스의 사진을 지우게 된다
--   (5) 큐는 **다른 가구에서 보이지 않는다** (RLS)
--   (6) 클라이언트는 큐에 **넣을 수 없다** — 넣으면 남의 파일을 지우게 만들 수 있다
--   (7) 상한 초과로 중단되면 큐도 비어 있다

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@gc.test','x',now(),now(),'{"full_name":"에이"}'),
  ('c0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@gc.test','x',now(),now(),'{"full_name":"비"}');

insert into households (id, name, created_by) values
  ('c0000001-0000-0000-0000-00000000000a','집A','c0000000-0000-0000-0000-000000000001'),
  ('c0000001-0000-0000-0000-00000000000b','집B','c0000000-0000-0000-0000-000000000002');

insert into household_members (household_id, user_id, role) values
  ('c0000001-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-000000000001','owner'),
  ('c0000001-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-000000000002','owner');

insert into locations (id, household_id, name, created_by, updated_by) values
  ('c0000002-0000-0000-0000-00000000000a','c0000001-0000-0000-0000-00000000000a','창고',
   'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001');

-- 박스 둘: 하나는 비어서 지워질 것, 하나는 안에 물건이 살아 있어 못 지울 것
insert into containers (id, household_id, location_id, name, photo_path, thumb_path, created_by, updated_by, deleted_at) values
  ('c0000003-0000-0000-0000-00000000000a','c0000001-0000-0000-0000-00000000000a','c0000002-0000-0000-0000-00000000000a','빈 박스',
   'hh/box1/v.jpg','hh/box1/v_t.jpg','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', now() - interval '40 days'),
  ('c0000003-0000-0000-0000-00000000000b','c0000001-0000-0000-0000-00000000000a','c0000002-0000-0000-0000-00000000000a','산 물건이 든 박스',
   'hh/box2/v.jpg','hh/box2/v_t.jpg','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', now() - interval '40 days');

insert into items (id, household_id, location_id, container_id, name, photo_path, thumb_path, created_by, updated_by, deleted_at) values
  -- 지워질 것 (사진 있음)
  ('c0000004-0000-0000-0000-00000000000a','c0000001-0000-0000-0000-00000000000a','c0000002-0000-0000-0000-00000000000a',null,'낡은 물건',
   'hh/item1/v.jpg','hh/item1/v_t.jpg','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', now() - interval '40 days'),
  -- 지워질 것 (사진 없음)
  ('c0000004-0000-0000-0000-00000000000b','c0000001-0000-0000-0000-00000000000a','c0000002-0000-0000-0000-00000000000a',null,'사진 없는 물건',
   null,null,'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', now() - interval '40 days'),
  -- 아직 안 지워질 것 (10일)
  ('c0000004-0000-0000-0000-00000000000c','c0000001-0000-0000-0000-00000000000a','c0000002-0000-0000-0000-00000000000a',null,'최근에 지운 물건',
   'hh/item3/v.jpg','hh/item3/v_t.jpg','c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', now() - interval '10 days'),
  -- 살아 있는 물건 — box2 안에 있어 box2 를 못 지우게 만든다
  ('c0000004-0000-0000-0000-00000000000d','c0000001-0000-0000-0000-00000000000a','c0000002-0000-0000-0000-00000000000a','c0000003-0000-0000-0000-00000000000b','살아 있는 물건',
   null,null,'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', null);

-- ─────────────────────────────────────────────────────────────
-- (6) 클라이언트는 큐에 넣을 수 없다 — insert 정책이 아예 없다
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into storage_gc (path, household_id)
    values ('남/의/파일.jpg','c0000001-0000-0000-0000-00000000000b')$$,
  '42501',
  null,
  '클라이언트는 수거 큐에 넣을 수 없다 (넣을 수 있으면 남의 파일을 지우게 만들 수 있다)'
);
reset role;
reset request.jwt.claims;

-- ─────────────────────────────────────────────────────────────
-- purge 실행 (cron 과 같은 조건: 로그인 아님)
-- ─────────────────────────────────────────────────────────────
select public.purge_expired_soft_deletes();

-- (1) 지워진 물건의 사진 두 장이 큐에 있다
select bag_eq(
  $$select path from storage_gc where path like 'hh/item1/%'$$,
  $$values ('hh/item1/v.jpg'),('hh/item1/v_t.jpg')$$,
  '(1) 하드 삭제된 물건의 원본·썸네일 경로가 큐에 남는다'
);
select is(
  (select count(*)::int from items where id = 'c0000004-0000-0000-0000-00000000000a'),
  0, '(1) 그 물건 행은 실제로 사라졌다'
);

-- (2) 사진 없는 물건은 큐에 아무것도 안 남긴다
select is(
  (select count(*)::int from storage_gc where path is null), 0,
  '(2) null 경로는 큐에 들어가지 않는다'
);

-- (3) 30일 안 지난 물건의 사진은 큐에 없다
select is(
  (select count(*)::int from storage_gc where path like 'hh/item3/%'), 0,
  '(3) 아직 안 지워질 물건의 사진은 큐에 들어가지 않는다'
);
select is(
  (select count(*)::int from items where id = 'c0000004-0000-0000-0000-00000000000c'),
  1, '(3) 그 물건은 아직 살아 있다'
);

-- (4) 안의 물건 때문에 못 지운 박스의 사진은 큐에 없다
select is(
  (select count(*)::int from containers where id = 'c0000003-0000-0000-0000-00000000000b'),
  1, '(4) 살아 있는 물건이 든 박스는 안 지워진다'
);
select is(
  (select count(*)::int from storage_gc where path like 'hh/box2/%'), 0,
  '(4) 그러므로 그 박스의 사진도 큐에 들어가면 안 된다 — 들어가면 살아 있는 사진을 지운다'
);
-- 반대로 빈 박스는 지워졌고 사진도 큐에 있다
select is(
  (select count(*)::int from containers where id = 'c0000003-0000-0000-0000-00000000000a'),
  0, '(4) 빈 박스는 지워졌다'
);
select is(
  (select count(*)::int from storage_gc where path like 'hh/box1/%'), 2,
  '(4) 그 박스의 사진 두 장은 큐에 있다'
);

-- ─────────────────────────────────────────────────────────────
-- (5) 큐는 다른 가구에서 안 보인다
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from storage_gc), 0,
  '(5) 남의 가구 수거 큐는 한 줄도 보이지 않는다'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from storage_gc), 4,
  '(5) 내 가구 큐는 보인다 (물건 2 + 빈 박스 2)'
);
-- 앱이 비울 수 있어야 한다
delete from storage_gc where path = 'hh/item1/v.jpg';
select is(
  (select count(*)::int from storage_gc where path = 'hh/item1/v.jpg'), 0,
  '(5) 앱이 지운 뒤 큐에서 뺄 수 있다'
);
reset role;
reset request.jwt.claims;

-- ─────────────────────────────────────────────────────────────
-- (7) 상한 초과로 중단되면 큐도 비어 있어야 한다
-- ─────────────────────────────────────────────────────────────
delete from storage_gc;
update app_settings set value = '1' where key = 'cron_delete_batch_abort_over';
insert into items (id, household_id, location_id, name, photo_path, thumb_path, created_by, updated_by, deleted_at)
select gen_random_uuid(), 'c0000001-0000-0000-0000-00000000000a','c0000002-0000-0000-0000-00000000000a',
       'many ' || g, 'hh/many' || g || '/v.jpg', 'hh/many' || g || '/v_t.jpg',
       'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', now() - interval '40 days'
from generate_series(1,3) g;

select public.purge_expired_soft_deletes();
select is(
  (select count(*)::int from storage_gc), 0,
  '(7) 상한 초과로 중단되면 큐에도 아무것도 안 넣는다 — 지우지도 않았으므로'
);
select isnt(
  (select aborted_reason from maintenance_log order by id desc limit 1), null,
  '(7) 중단 사유가 기록된다'
);

select * from finish();
rollback;
