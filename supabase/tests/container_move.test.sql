-- 홈 스토어 — 박스를 통째로 다른 장소로 옮기기 (2026-09-05)
--
-- 고정하려는 것:
--   (1) 박스를 옮기면 **안의 물건도 같이** 옮겨진다 — 이게 빠지면 박스 화면과
--       찾기 결과가 서로 다른 장소를 말한다
--   (2) 물건은 박스 안에 그대로 있다 (container_id 는 안 건드린다)
--   (3) 물건마다 'moved' 이벤트가 남는다 (AC21)
--   (4) 옛 장소에 그냥 놓여 있던 낱개 물건은 따라가지 않는다
--   (5) 남의 가구 장소로는 못 옮긴다 — 경로가 끊긴 물건은 되찾을 수 없다
--   (6) 남의 가구 박스는 애초에 못 옮긴다 (RLS 는 오류가 아니라 0행이다)
--   (7) 지워진 물건은 그 자리에 두되, 되살리면 t20 이 박스 쪽 장소로 맞춘다
--   (8) 박스를 지우는 것은 여전히 "물건은 있던 장소에 남는다" 다 (M3 유지)

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ─────────────────────────────────────────────────────────────
-- 픽스처 — 가구 A(나): 현관·안방 두 장소, 현관에 박스 하나
--          가구 B(남): 창고 하나
-- ─────────────────────────────────────────────────────────────
\set ua 'e0000000-0000-0000-0000-000000000001'
\set ub 'e0000000-0000-0000-0000-000000000002'
\set ha 'e0000001-0000-0000-0000-00000000000a'
\set hb 'e0000001-0000-0000-0000-00000000000b'
\set l_hall  'e0000002-0000-0000-0000-000000000001'
\set l_room  'e0000002-0000-0000-0000-000000000002'
\set l_other 'e0000002-0000-0000-0000-00000000000b'
\set box   'e0000003-0000-0000-0000-000000000001'
\set it_in 'e0000004-0000-0000-0000-000000000001'
\set it_loose 'e0000004-0000-0000-0000-000000000002'
\set it_gone  'e0000004-0000-0000-0000-000000000003'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  (:'ua','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@move.test','x',now(),now(),'{"full_name":"에이"}'),
  (:'ub','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@move.test','x',now(),now(),'{"full_name":"비"}');

insert into households (id, name, created_by) values (:'ha','집A',:'ua'), (:'hb','집B',:'ub');
insert into household_members (household_id, user_id, role) values (:'ha',:'ua','owner'), (:'hb',:'ub','owner');

insert into locations (id, household_id, name, created_by, updated_by) values
  (:'l_hall',  :'ha', '현관', :'ua', :'ua'),
  (:'l_room',  :'ha', '안방', :'ua', :'ua'),
  (:'l_other', :'hb', '창고', :'ub', :'ub');

insert into containers (id, household_id, location_id, name, created_by, updated_by)
values (:'box', :'ha', :'l_hall', '3번 박스', :'ua', :'ua');

insert into items (id, household_id, location_id, container_id, name, created_by, updated_by) values
  (:'it_in',    :'ha', :'l_hall', :'box', '박스 안 물건',  :'ua', :'ua'),
  (:'it_loose', :'ha', :'l_hall', null,   '현관 낱개 우산', :'ua', :'ua'),
  (:'it_gone',  :'ha', :'l_hall', :'box', '지워진 물건',   :'ua', :'ua');

update items set deleted_at = now() where id = :'it_gone';

-- ═════════════════════════════════════════════════════════════
-- (1)~(4) 현관 → 안방
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'ua'), true);
set local role authenticated;

update containers set location_id = :'l_room' where id = :'box';

select is((select location_id from containers where id = :'box'), :'l_room'::uuid,
  '(1) 박스가 안방으로 옮겨진다');
select is((select location_id from items where id = :'it_in'), :'l_room'::uuid,
  '(1) 박스 안의 물건도 안방으로 따라간다');
select is((select container_id from items where id = :'it_in'), :'box'::uuid,
  '(2) 물건은 박스 안에 그대로 있다');
select is((select type from item_events where item_id = :'it_in' order by id desc limit 1),
  'moved', '(3) 물건마다 moved 이벤트가 남는다 (AC21)');
select is((select location_id from items where id = :'it_loose'), :'l_hall'::uuid,
  '(4) 장소에 그냥 놓인 낱개 물건은 현관에 남는다');

-- 요약 뷰가 곧 화면이다 — 개수가 옮겨간 대로 나와야 한다
reset role;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'ua'), true);
set local role authenticated;
select is((select container_count::int from location_summary where id = :'l_room'), 1,
  '(1) 안방의 박스 개수가 1이 된다');
select is((select item_count::int from location_summary where id = :'l_hall'), 1,
  '(4) 현관에는 낱개 물건 하나만 남는다');

-- ═════════════════════════════════════════════════════════════
-- (7) 지워진 물건은 그 자리에 두고, 되살릴 때 맞춘다
-- ═════════════════════════════════════════════════════════════
select is((select location_id from items where id = :'it_gone'), :'l_hall'::uuid,
  '(7) 지워진 물건은 이동 대상이 아니다');
update items set deleted_at = null where id = :'it_gone';
select is((select location_id from items where id = :'it_gone'), :'l_room'::uuid,
  '(7) 되살리면 t20 이 박스 쪽 장소로 맞춘다');

-- ═════════════════════════════════════════════════════════════
-- (5) 남의 가구 장소로는 못 옮긴다
-- ═════════════════════════════════════════════════════════════
select throws_ok(
  format($$update containers set location_id = '%s' where id = '%s'$$, :'l_other', :'box'),
  '23514', null, '(5) 다른 가구의 장소로 옮기면 거부된다');
select throws_ok(
  format($$update containers set location_id = '%s' where id = '%s'$$,
         'e0000002-0000-0000-0000-0000000000ff', :'box'),
  '23503', null, '(5) 없는 장소로 옮기면 거부된다');

-- ═════════════════════════════════════════════════════════════
-- (6) 남의 가구 박스는 손댈 수 없다 — 오류가 아니라 0행이다
-- ═════════════════════════════════════════════════════════════
reset role;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'ub'), true);
set local role authenticated;

with upd as (
  update containers set location_id = :'l_other' where id = :'box' returning 1
)
select is((select count(*)::int from upd), 0, '(6) 타 가구 박스 이동은 0행 (RLS)');

reset role;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'ua'), true);
set local role authenticated;
select is((select location_id from containers where id = :'box'), :'l_room'::uuid,
  '(6) 박스는 안방에 그대로다');

-- ═════════════════════════════════════════════════════════════
-- (8) 박스 삭제는 여전히 M3 그대로 — 물건은 있던 장소에 남는다
-- ═════════════════════════════════════════════════════════════
update containers set deleted_at = now() where id = :'box';
select is((select container_id from items where id = :'it_in'), null,
  '(8) 박스를 지우면 물건이 장소 직속이 된다');
select is((select location_id from items where id = :'it_in'), :'l_room'::uuid,
  '(8) 물건은 마지막으로 있던 장소(안방)에 남는다');

reset role;
select * from finish();
rollback;
