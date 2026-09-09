-- 홈 스토어 — 사진 순서 바꾸기 (2026-09-09)
--
-- 고정하려는 것:
--   (1) 배열 순서대로 sort_order 가 0부터 다시 적히고, 첫 장이 대표(items.photo_path)가 된다
--   (2) 사진을 빠뜨리거나 두 번 적으면 튕긴다 (반쯤 적힌 순서를 남기지 않는다)
--   (3) 다른 물건의 사진 id 를 섞으면 튕긴다
--   (4) 남의 물건은 RLS 로 안 보여서 튕긴다 — 순서를 못 건드린다
--   (5) 익명은 부를 수 없다

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ua 'a1000000-0000-0000-0000-000000000001'
\set ub 'a1000000-0000-0000-0000-000000000002'
\set ha 'a1000001-0000-0000-0000-00000000000a'
\set hb 'a1000001-0000-0000-0000-00000000000b'
\set la 'a1000002-0000-0000-0000-00000000000a'
\set lb 'a1000002-0000-0000-0000-00000000000b'
\set ia 'a1000004-0000-0000-0000-00000000000a'
\set ib 'a1000004-0000-0000-0000-00000000000b'
\set p1 'a1000005-0000-0000-0000-000000000001'
\set p2 'a1000005-0000-0000-0000-000000000002'
\set p3 'a1000005-0000-0000-0000-000000000003'
\set pb 'a1000005-0000-0000-0000-00000000000b'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@reorder.test','x',now(),now(),'{"full_name":"에이"}'),
  (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@reorder.test','x',now(),now(),'{"full_name":"비"}');
insert into households (id, name, created_by) values (:'ha','집A',:'ua'), (:'hb','집B',:'ub');
insert into household_members (household_id, user_id, role) values (:'ha',:'ua','owner'), (:'hb',:'ub','owner');
insert into locations (id, household_id, name, created_by, updated_by) values
  (:'la',:'ha','창고',:'ua',:'ua'), (:'lb',:'hb','창고',:'ub',:'ub');
insert into items (id, household_id, location_id, name, created_by, updated_by) values
  (:'ia',:'ha',:'la','내 물건',:'ua',:'ua'), (:'ib',:'hb',:'lb','남의 물건',:'ub',:'ub');
insert into item_photos (id, household_id, item_id, photo_path, thumb_path, sort_order, created_by) values
  (:'p1',:'ha',:'ia','ha/ia/p1.jpg','ha/ia/p1_t.jpg',0,:'ua'),
  (:'p2',:'ha',:'ia','ha/ia/p2.jpg','ha/ia/p2_t.jpg',1,:'ua'),
  (:'p3',:'ha',:'ia','ha/ia/p3.jpg','ha/ia/p3_t.jpg',2,:'ua'),
  (:'pb',:'hb',:'ib','hb/ib/pb.jpg','hb/ib/pb_t.jpg',0,:'ub');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- (1) p3, p1, p2 순으로
select lives_ok(
  $$select reorder_item_photos('a1000004-0000-0000-0000-00000000000a',
      array['a1000005-0000-0000-0000-000000000003','a1000005-0000-0000-0000-000000000001','a1000005-0000-0000-0000-000000000002']::uuid[])$$,
  '(1) 순서를 한 번에 적는다');
select is((select sort_order from item_photos where id = :'p3'), 0, '(1) 첫 장은 0');
select is((select sort_order from item_photos where id = :'p1'), 1, '(1) 둘째 장은 1');
select is((select sort_order from item_photos where id = :'p2'), 2, '(1) 셋째 장은 2');
select is((select photo_path from items where id = :'ia'), 'ha/ia/p3.jpg', '(1) 첫 장이 대표가 된다 (t61)');

-- (2) 빠뜨리면 · 두 번 적으면
select throws_ok(
  $$select reorder_item_photos('a1000004-0000-0000-0000-00000000000a',
      array['a1000005-0000-0000-0000-000000000001','a1000005-0000-0000-0000-000000000002']::uuid[])$$,
  '23514', null, '(2) 사진을 빠뜨리면 튕긴다');
select throws_ok(
  $$select reorder_item_photos('a1000004-0000-0000-0000-00000000000a',
      array['a1000005-0000-0000-0000-000000000001','a1000005-0000-0000-0000-000000000001','a1000005-0000-0000-0000-000000000002']::uuid[])$$,
  '23514', null, '(2) 같은 사진을 두 번 적으면 튕긴다');

-- (3) 남의 물건 사진 id 를 섞으면
select throws_ok(
  $$select reorder_item_photos('a1000004-0000-0000-0000-00000000000a',
      array['a1000005-0000-0000-0000-000000000001','a1000005-0000-0000-0000-000000000002','a1000005-0000-0000-0000-00000000000b']::uuid[])$$,
  '23514', null, '(3) 다른 물건의 사진이 섞이면 튕긴다');

-- (4) 남의 물건은 안 보여서 튕긴다
select throws_ok(
  $$select reorder_item_photos('a1000004-0000-0000-0000-00000000000b',
      array['a1000005-0000-0000-0000-00000000000b']::uuid[])$$,
  '23514', null, '(4) 남의 물건 순서는 못 건드린다');
reset role; reset request.jwt.claims;
select is((select sort_order from item_photos where id = :'pb'), 0, '(4) 남의 사진은 그대로');
select is((select sort_order from item_photos where id = :'p3'), 0, '(2)(3) 실패한 호출은 아무것도 바꾸지 않았다');

-- (5) 익명
set local role anon;
select throws_ok(
  $$select reorder_item_photos('a1000004-0000-0000-0000-00000000000a', array['a1000005-0000-0000-0000-000000000001']::uuid[])$$,
  '42501', null, '(5) 로그인 없이는 부를 수 없다');

select * from finish();
rollback;
