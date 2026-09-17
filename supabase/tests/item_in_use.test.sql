-- 홈 스토어 — 사용중 상태 (2026-09-17)
--
-- 고정하려는 것:
--   (1) 꺼내면 in_use_by 가 **꺼낸 사람(auth.uid)** 으로 찍히고 이력에 'checked_out' 이 남는다
--   (2) 사용중인 채 다른 칸을 고쳐도 꺼낸 시각·사람은 그대로다 (다시 보내도 덮이지 않는다)
--   (3) 제자리에 두면 둘 다 비고 이력에 'returned' 가 남는다
--   (4) 클라이언트가 보낸 in_use_by 는 무시된다
--   (5) 위치는 건드리지 않는다 — 사용중은 이동이 아니다
--   (6) 남의 가구 물건은 0행 (RLS)

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ua 'f2000000-0000-0000-0000-000000000001'
\set ub 'f2000000-0000-0000-0000-000000000002'
\set ha 'f2000001-0000-0000-0000-00000000000a'
\set hb 'f2000001-0000-0000-0000-00000000000b'
\set la 'f2000002-0000-0000-0000-00000000000a'
\set lb 'f2000002-0000-0000-0000-00000000000b'
\set ia 'f2000004-0000-0000-0000-00000000000a'
\set ib 'f2000004-0000-0000-0000-00000000000b'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@use.test','x',now(),now(),'{"full_name":"에이"}'),
  (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@use.test','x',now(),now(),'{"full_name":"비"}');
insert into households (id, name, created_by) values (:'ha','집A',:'ua'), (:'hb','집B',:'ub');
-- ⚠ ub 는 집A 의 구성원이기도 하다 — "다른 사람이 꺼낸 것을 내가 돌려놓는" 경우를 본다
insert into household_members (household_id, user_id, role) values
  (:'ha',:'ua','owner'), (:'ha',:'ub','member'), (:'hb',:'ub','owner');
insert into locations (id, household_id, name, created_by, updated_by) values
  (:'la',:'ha','창고',:'ua',:'ua'), (:'lb',:'hb','창고',:'ub',:'ub');
insert into items (id, household_id, location_id, name, created_by, updated_by) values
  (:'ia',:'ha',:'la','멀티탭',:'ua',:'ua'), (:'ib',:'hb',:'lb','남의 것',:'ub',:'ub');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- (1) 꺼내기
update items set in_use_since = '2026-09-17 09:00:00+09' where id = :'ia';
select is((select in_use_since from items where id = :'ia'), '2026-09-17 09:00:00+09'::timestamptz, '(1) 꺼낸 시각이 저장된다');
select is((select in_use_by from items where id = :'ia'), :'ua'::uuid, '(1) 꺼낸 사람은 auth.uid()');
select is((select type from item_events where item_id = :'ia' order by id desc limit 1), 'checked_out', '(1) 이력 종류는 checked_out');
select is(
  (select payload->'in_use_since'->0 from item_events where item_id = :'ia' order by id desc limit 1),
  'null'::jsonb, '(1) 이력 payload 의 이전 값은 null');
select is((select location_id from items where id = :'ia'), :'la'::uuid, '(5) 위치는 그대로');

-- (2) 사용중인 채 메모를 고친다 — 꺼낸 시각·사람 불변, 이력은 updated
update items set note = '거실 TV 뒤' where id = :'ia';
select is((select in_use_since from items where id = :'ia'), '2026-09-17 09:00:00+09'::timestamptz, '(2) 다른 칸을 고쳐도 꺼낸 시각 그대로');
select is((select type from item_events where item_id = :'ia' order by id desc limit 1), 'updated', '(2) 메모 수정은 updated');

-- (2) 다른 사람이 꺼낸 시각을 다시 보내도(중복 탭) 처음 값이 이긴다
set local request.jwt.claims = '{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}';
update items set in_use_since = now() where id = :'ia';
select is((select in_use_since from items where id = :'ia'), '2026-09-17 09:00:00+09'::timestamptz, '(2) 이미 사용중이면 시각이 덮이지 않는다');
select is((select in_use_by from items where id = :'ia'), :'ua'::uuid, '(2) 꺼낸 사람도 그대로');
select is((select count(*) from item_events where item_id = :'ia' and type = 'checked_out'), 1::bigint, '(2) checked_out 이력은 한 번뿐');

-- (3) 다른 구성원이 제자리에 둔다
update items set in_use_since = null where id = :'ia';
select is((select in_use_since from items where id = :'ia'), null, '(3) 제자리에 두면 시각이 빈다');
select is((select in_use_by from items where id = :'ia'), null, '(3) 꺼낸 사람도 빈다');
select is((select type from item_events where item_id = :'ia' order by id desc limit 1), 'returned', '(3) 이력 종류는 returned');
select is((select actor_id from item_events where item_id = :'ia' order by id desc limit 1), :'ub'::uuid, '(3) 돌려놓은 사람이 이력의 actor');

-- (4) 클라이언트가 in_use_by 를 보내도 무시된다
update items set in_use_since = now(), in_use_by = :'ua' where id = :'ia';
select is((select in_use_by from items where id = :'ia'), :'ub'::uuid, '(4) 보낸 in_use_by 는 무시되고 auth.uid() 가 찍힌다');
update items set in_use_since = null where id = :'ia';

-- (6) 남의 물건은 0행
set local request.jwt.claims = '{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}';
update items set in_use_since = now() where id = :'ib';
reset role;
select is((select in_use_since from items where id = :'ib'), null, '(6) 남의 가구 물건은 못 꺼낸다');

-- 옛 이력 종류가 여전히 허용되는지 — 제약을 갈아 끼웠으므로
select lives_ok(
  $$ insert into item_events (household_id, item_id, type) values ('f2000001-0000-0000-0000-00000000000a', 'f2000004-0000-0000-0000-00000000000a', 'qty_changed') $$,
  '제약 교체 뒤에도 기존 종류는 허용');
select throws_ok(
  $$ insert into item_events (household_id, item_id, type) values ('f2000001-0000-0000-0000-00000000000a', 'f2000004-0000-0000-0000-00000000000a', 'borrowed') $$,
  '23514', null, '모르는 종류는 거부');

select * from finish();
rollback;
