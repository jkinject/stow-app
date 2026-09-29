-- 홈 스토어 — 음식 탭 레시피 저장 (2026-09-29)
--
-- 고정하려는 것:
--   (1) 하루 상한: 예약이 상한까지 줄어들고, 넘으면 DAILY_LIMIT
--   (2) 저장 + 현재 포인터: 첫 저장은 revision 1, 이후 +1
--   (3) 같은 request_id 재전송은 새 행을 만들지 않고 같은 세트를 돌려준다
--   (4) 낡은 revision 으로 저장하면 REVISION_MISMATCH — 가족 동시 요청이 서로 덮지 않는다
--   (5) point 는 호출 없이 현재 포인터만 옮긴다
--   (6) authenticated 는 세 RPC 를 실행할 수 없다 (상한·CAS 우회 금지)
--   (7) 구성원은 읽고, 비구성원은 0행 (RLS)

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ua 'f0000000-0000-0000-0000-000000000001'
\set ub 'f0000000-0000-0000-0000-000000000002'
\set ha 'f0000001-0000-0000-0000-00000000000a'
\set r1 'a0000009-0000-0000-0000-000000000001'
\set r2 'a0000009-0000-0000-0000-000000000002'

-- 픽스처 — 다른 테스트와 같은 모양 (item_photos.test.sql). 가구 A 에 에이, 비는 남이다
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@food.test','x',now(),now(),'{"full_name":"에이"}'),
  (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@food.test','x',now(),now(),'{"full_name":"비"}');
insert into households (id, name, created_by) values (:'ha','집A',:'ua');
insert into household_members (household_id, user_id, role) values (:'ha',:'ua','owner');

reset role;
reset request.jwt.claims;

-- (1) 상한 2
select is(public.food_recipe_reserve(:'ha', 2), 1, '(1) 첫 예약 뒤 1회 남음');
select is(public.food_recipe_reserve(:'ha', 2), 0, '(1) 두 번째 예약 뒤 0회');
select throws_ok(
  $$ select public.food_recipe_reserve('f0000001-0000-0000-0000-00000000000a', 2) $$,
  'DAILY_LIMIT', '(1) 상한을 넘기면 DAILY_LIMIT');

-- (2) 첫 저장
select is(
  (select revision from public.food_recipe_store(:'ha', :'r1', :'ua', 'k1', 0, 'ko', 'm', 'v1', '', '[]'::jsonb, '{"recipes":[]}'::jsonb, 0)),
  1::bigint, '(2) 첫 저장은 revision 1');
select is((select count(*)::int from public.food_recipe_current where household_id = :'ha'), 1, '(2) 현재 포인터가 생겼다');

-- (3) 재전송
select is(
  (select set_id from public.food_recipe_store(:'ha', :'r1', :'ua', 'k1', 0, 'ko', 'm', 'v1', '', '[]'::jsonb, '{"recipes":[]}'::jsonb, 0)),
  (select id from public.food_recipe_sets where household_id = :'ha' and request_id = :'r1'),
  '(3) 같은 request_id 는 같은 세트');
select is((select count(*)::int from public.food_recipe_sets where household_id = :'ha'), 1, '(3) 행이 늘지 않았다');

-- (4) CAS
select throws_ok(
  $$ select * from public.food_recipe_store('f0000001-0000-0000-0000-00000000000a', 'a0000009-0000-0000-0000-000000000002',
       'f0000000-0000-0000-0000-000000000001', 'k1', 1, 'ko', 'm', 'v1', '', '[]'::jsonb, '{"recipes":[]}'::jsonb, 0) $$,
  'REVISION_MISMATCH', '(4) 낡은 revision 으로는 저장 불가');
select is(
  (select revision from public.food_recipe_store(:'ha', :'r2', :'ua', 'k1', 1, 'ko', 'm', 'v1', '', '[]'::jsonb, '{"recipes":[]}'::jsonb, 1)),
  2::bigint, '(4) 맞는 revision 이면 저장, revision 2');

-- (5) point
select is(
  public.food_recipe_point(:'ha', (select id from public.food_recipe_sets where household_id = :'ha' and request_id = :'r1'), 2),
  3::bigint, '(5) point 는 revision 을 올리며 포인터만 옮긴다');
select is(
  (select c.set_id from public.food_recipe_current c where c.household_id = :'ha'),
  (select id from public.food_recipe_sets where household_id = :'ha' and request_id = :'r1'),
  '(5) 현재는 첫 세트를 가리킨다');

-- (6) authenticated 는 RPC 실행 불가
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_like(
  $$ select public.food_recipe_reserve('f0000001-0000-0000-0000-00000000000a', 5) $$,
  '%permission denied%', '(6) reserve 는 service_role 전용');
select throws_like(
  $$ select public.food_recipe_point('f0000001-0000-0000-0000-00000000000a', gen_random_uuid(), 0) $$,
  '%permission denied%', '(6) point 는 service_role 전용');

-- (7) RLS
select is((select count(*)::int from public.food_recipe_sets where household_id = :'ha'), 2, '(7) 구성원은 세트를 읽는다');
select is((select count(*)::int from public.food_recipe_current where household_id = :'ha'), 1, '(7) 구성원은 현재 포인터를 읽는다');
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.food_recipe_sets where household_id = :'ha'), 0, '(7) 비구성원에게는 0행');

select * from finish();
rollback;
