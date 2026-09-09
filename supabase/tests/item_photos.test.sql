-- 홈 스토어 — 물건 사진 여러 장 (2026-09-08)
--
-- 고정하려는 것:
--   (1) 사진을 넣으면 items 의 대표 사진(photo_path/thumb_path)이 **첫 장**으로 맞춰진다
--   (2) 순서를 바꾸면(sort_order) 대표 사진이 따라 바뀐다 — "대표로 지정" 의 근거
--   (3) 대표 사진을 지우면 다음 장이 대표가 되고, 마지막 장을 지우면 null 이 된다
--   (4) 대표가 바뀌면 t30 이 이력을 남기고, 대표가 안 바뀌면(둘째 장 추가) 남기지 않는다
--   (5) 가구 id 는 클라이언트가 뭐라고 보내든 **물건의 가구**로 덮어써진다
--   (6) 남의 물건에는 사진을 못 붙인다 (RLS 로 물건이 안 보여서 튕긴다)
--   (7) 남의 사진은 보이지도, 지워지지도 않는다 (RLS — 삭제는 오류가 아니라 0행)
--   (8) 물건 하나에 11장째는 막힌다
--   (9) 사진을 다른 물건으로 옮길 수 없다
--  (10) 30일 지난 물건을 하드 삭제할 때 **모든 장**의 경로가 수거 큐에 들어간다
--  (11) 탈퇴 미리보기에 모든 장의 경로가 나온다
--  (12) 기존 한 장짜리 물건은 마이그레이션이 item_photos 로 옮겨 놓았다 (시드로 확인)

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ua 'f0000000-0000-0000-0000-000000000001'
\set ub 'f0000000-0000-0000-0000-000000000002'
\set ha 'f0000001-0000-0000-0000-00000000000a'
\set hb 'f0000001-0000-0000-0000-00000000000b'
\set la 'f0000002-0000-0000-0000-00000000000a'
\set lb 'f0000002-0000-0000-0000-00000000000b'
\set ia 'f0000004-0000-0000-0000-00000000000a'
\set ib 'f0000004-0000-0000-0000-00000000000b'
\set p1 'f0000005-0000-0000-0000-000000000001'
\set p2 'f0000005-0000-0000-0000-000000000002'
\set p3 'f0000005-0000-0000-0000-000000000003'
\set pb 'f0000005-0000-0000-0000-00000000000b'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@photos.test','x',now(),now(),'{"full_name":"에이"}'),
  (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@photos.test','x',now(),now(),'{"full_name":"비"}');

insert into households (id, name, created_by) values (:'ha','집A',:'ua'), (:'hb','집B',:'ub');
insert into household_members (household_id, user_id, role) values (:'ha',:'ua','owner'), (:'hb',:'ub','owner');
insert into locations (id, household_id, name, created_by, updated_by) values
  (:'la',:'ha','창고',:'ua',:'ua'), (:'lb',:'hb','창고',:'ub',:'ub');
insert into items (id, household_id, location_id, name, created_by, updated_by) values
  (:'ia',:'ha',:'la','내 물건',:'ua',:'ua'),
  (:'ib',:'hb',:'lb','남의 물건',:'ub',:'ub');

-- 남의 가구의 사진 한 장 (RLS 확인용)
insert into item_photos (id, household_id, item_id, photo_path, thumb_path, created_by) values
  (:'pb',:'hb',:'ib','hb/ib/pb.jpg','hb/ib/pb_t.jpg',:'ub');

-- ─────────────────────────────────────────────────────────────
-- 나(에이)로 로그인
-- ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- (1) 첫 장을 넣으면 대표 사진이 된다
insert into item_photos (id, household_id, item_id, photo_path, thumb_path, sort_order) values
  (:'p1',:'ha',:'ia','ha/ia/p1.jpg','ha/ia/p1_t.jpg',0);
select is((select photo_path from items where id = :'ia'), 'ha/ia/p1.jpg', '(1) 첫 장 → items.photo_path');
select is((select thumb_path from items where id = :'ia'), 'ha/ia/p1_t.jpg', '(1) 첫 장 → items.thumb_path');

-- (4) 대표가 바뀌었으니 이력이 남는다
select is((select count(*)::int from item_events where item_id = :'ia' and type = 'updated' and payload ? 'photo_path'),
  1, '(4) 대표 사진 변경은 이력에 남는다');

-- 둘째 장은 뒤에 붙는다 — 대표는 그대로
insert into item_photos (id, household_id, item_id, photo_path, thumb_path, sort_order) values
  (:'p2',:'ha',:'ia','ha/ia/p2.jpg','ha/ia/p2_t.jpg',1);
select is((select photo_path from items where id = :'ia'), 'ha/ia/p1.jpg', '(1) 둘째 장을 붙여도 대표는 첫 장');
select is((select count(*)::int from item_events where item_id = :'ia' and type = 'updated' and payload ? 'photo_path'),
  1, '(4) 대표가 안 바뀌면 이력도 안 남는다');

-- (2) 둘째 장을 앞으로 보내면 대표가 된다
update item_photos set sort_order = -1 where id = :'p2';
select is((select photo_path from items where id = :'ia'), 'ha/ia/p2.jpg', '(2) 순서를 바꾸면 대표가 따라온다');

-- (3) 대표를 지우면 다음 장이, 마지막을 지우면 null
delete from item_photos where id = :'p2';
select is((select photo_path from items where id = :'ia'), 'ha/ia/p1.jpg', '(3) 대표를 지우면 다음 장이 대표');
delete from item_photos where id = :'p1';
select is((select photo_path from items where id = :'ia'), null, '(3) 마지막 장을 지우면 대표 없음');
select is((select thumb_path from items where id = :'ia'), null, '(3) 썸네일도 없음');

-- (5) 가구 id 를 엉뚱하게 보내도 물건의 가구로 덮어써진다
insert into item_photos (id, household_id, item_id, photo_path, thumb_path) values
  (:'p3',:'hb',:'ia','ha/ia/p3.jpg','ha/ia/p3_t.jpg');
select is((select household_id from item_photos where id = :'p3'), :'ha'::uuid,
  '(5) household_id 는 물건에서 가져온다 — 클라이언트 값은 무시');

-- (6) 남의 물건에는 못 붙인다 — 물건이 안 보여서 튕긴다
select throws_ok(
  $$insert into item_photos (id, household_id, item_id, photo_path, thumb_path)
    values ('f0000005-0000-0000-0000-000000000099','f0000001-0000-0000-0000-00000000000a',
            'f0000004-0000-0000-0000-00000000000b','x.jpg','x_t.jpg')$$,
  '23503', null, '(6) 남의 물건에 사진을 붙일 수 없다');

-- (7) 남의 사진은 보이지도 지워지지도 않는다
select is((select count(*)::int from item_photos where id = :'pb'), 0, '(7) 남의 사진은 안 보인다');
delete from item_photos where id = :'pb';
reset role;
select is((select count(*)::int from item_photos where id = :'pb'), 1, '(7) 남의 사진은 지워지지 않는다 (0행)');
select is((select photo_path from items where id = :'ib'), 'hb/ib/pb.jpg', '(7) 남의 대표 사진도 그대로');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- (9) 다른 물건으로 못 옮긴다
select throws_ok(
  $$update item_photos set item_id = 'f0000004-0000-0000-0000-00000000000b'
     where id = 'f0000005-0000-0000-0000-000000000003'$$,
  '23514', null, '(9) 사진의 물건을 바꿀 수 없다');

-- (8) 11장째는 막힌다 — p3 가 이미 한 장이니 9장을 더 넣고 11번째를 시도
insert into item_photos (id, household_id, item_id, photo_path, thumb_path, sort_order)
select gen_random_uuid(), :'ha', :'ia', 'ha/ia/x' || g || '.jpg', 'ha/ia/x' || g || '_t.jpg', g
  from generate_series(1, 9) g;
select is((select count(*)::int from item_photos where item_id = :'ia'), 10, '(8) 10장까지는 들어간다');
select throws_ok(
  $$insert into item_photos (id, household_id, item_id, photo_path, thumb_path)
    values ('f0000005-0000-0000-0000-000000000098','f0000001-0000-0000-0000-00000000000a',
            'f0000004-0000-0000-0000-00000000000a','y.jpg','y_t.jpg')$$,
  '23514', null, '(8) 11장째는 막힌다');

-- (11) 탈퇴 미리보기에 모든 장이 나온다 (나 혼자인 집이라 집A 가 통째로 사라진다)
select ok(
  (select (account_deletion_preview()->'photo_paths') @> '["ha/ia/p3.jpg","ha/ia/x9_t.jpg"]'::jsonb),
  '(11) 탈퇴 미리보기에 대표가 아닌 장도 들어 있다');

-- ─────────────────────────────────────────────────────────────
-- (10) 하드 삭제 전에 모든 장이 수거 큐로 — cron 이 postgres 로 돈다
-- ─────────────────────────────────────────────────────────────
reset role;
reset request.jwt.claims;
update items set deleted_at = now() - interval '40 days' where id = :'ia';
select public.purge_expired_soft_deletes();
select is((select count(*)::int from items where id = :'ia'), 0, '(10) 물건은 하드 삭제됐다');
select is((select count(*)::int from item_photos where item_id = :'ia'), 0, '(10) 사진 행도 CASCADE 로 사라졌다');
-- ⚠ 앞에서 지운 p1·p2 도 t62(20260908000200)가 큐에 넣으므로 그것은 빼고 센다
select is((select count(*)::int from storage_gc where path like 'ha/ia/x%' or path like 'ha/ia/p3%'), 20,
  '(10) 10장 × (원본+썸네일) = 20개 경로가 큐에 들어갔다');
select ok(
  (select bool_and(path like 'ha/ia/%') from storage_gc where household_id = :'ha'),
  '(10) 큐에 든 경로는 전부 그 물건의 것이다');

-- (12) 시드의 한 장짜리 물건이 옮겨져 있다 — 시드에 사진이 없으므로 "대표가 있으면 행도 있다" 로 확인
select is(
  (select count(*)::int from items i
    where i.photo_path is not null
      and not exists (select 1 from item_photos p where p.item_id = i.id)),
  0, '(12) 대표 사진이 있는데 item_photos 행이 없는 물건은 없다');

select * from finish();
rollback;
