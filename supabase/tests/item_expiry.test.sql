-- 홈 스토어 — 소비기한 (2026-09-08)
--
-- 고정하려는 것:
--   (1) 소비기한을 넣고·바꾸고·지우는 것이 변경 이력에 남는다
--   (2) 날짜만 받는다 — 시각이 섞인 값은 날짜로 잘린다 (date 형)
--   (3) 구성원은 자기 가구 물건의 기한만 고칠 수 있다 (RLS 는 오류가 아니라 0행)

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ua 'f1000000-0000-0000-0000-000000000001'
\set ub 'f1000000-0000-0000-0000-000000000002'
\set ha 'f1000001-0000-0000-0000-00000000000a'
\set hb 'f1000001-0000-0000-0000-00000000000b'
\set la 'f1000002-0000-0000-0000-00000000000a'
\set lb 'f1000002-0000-0000-0000-00000000000b'
\set ia 'f1000004-0000-0000-0000-00000000000a'
\set ib 'f1000004-0000-0000-0000-00000000000b'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@exp.test','x',now(),now(),'{"full_name":"에이"}'),
  (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@exp.test','x',now(),now(),'{"full_name":"비"}');
insert into households (id, name, created_by) values (:'ha','집A',:'ua'), (:'hb','집B',:'ub');
insert into household_members (household_id, user_id, role) values (:'ha',:'ua','owner'), (:'hb',:'ub','owner');
insert into locations (id, household_id, name, created_by, updated_by) values (:'la',:'ha','창고',:'ua',:'ua'), (:'lb',:'hb','창고',:'ub',:'ub');
insert into items (id, household_id, location_id, name, created_by, updated_by) values
  (:'ia',:'ha',:'la','참치캔',:'ua',:'ua'), (:'ib',:'hb',:'lb','남의 것',:'ub',:'ub');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- (1) 넣기
update items set expires_on = '2027-03-15' where id = :'ia';
select is((select expires_on from items where id = :'ia'), '2027-03-15'::date, '(1) 소비기한이 저장된다');
select is(
  (select payload->'expires_on' from item_events where item_id = :'ia' and type = 'updated' order by id desc limit 1),
  '[null, "2027-03-15"]'::jsonb, '(1) 넣은 것이 이력에 남는다');

-- (1) 바꾸기·지우기
update items set expires_on = '2027-04-01' where id = :'ia';
select is(
  (select payload->'expires_on' from item_events where item_id = :'ia' order by id desc limit 1),
  '["2027-03-15", "2027-04-01"]'::jsonb, '(1) 바꾼 것이 이력에 남는다');
update items set expires_on = null where id = :'ia';
select is(
  (select payload->'expires_on' from item_events where item_id = :'ia' order by id desc limit 1),
  '["2027-04-01", null]'::jsonb, '(1) 지운 것이 이력에 남는다');

-- (2) 시각이 섞여도 날짜로
update items set expires_on = '2027-05-05 23:59:00'::timestamptz where id = :'ia';
select is((select expires_on from items where id = :'ia'), '2027-05-05'::date, '(2) 시각은 버리고 날짜만 남는다');

-- (3) 남의 물건은 0행
update items set expires_on = '2030-01-01' where id = :'ib';
reset role;
select is((select expires_on from items where id = :'ib'), null, '(3) 남의 가구 물건의 기한은 못 고친다');

select * from finish();
rollback;
