-- 홈 스토어 — 계정 탈퇴 (2026-08-31)
--
-- 사용자가 정한 규칙 세 갈래를 각각 고정한다:
--   (1) 관리자인데 다른 가족이 있다  → 관리자를 넘기고 나만 나간다. 집은 남는다
--   (2) 나 혼자인 집                → 집과 데이터가 통째로 사라진다
--   (3) 관리자가 아니다              → 그냥 나간다
-- 그리고 어느 갈래든: 인증 계정은 사라지고, 프로필은 익명화되어 **남는다**.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ─────────────────────────────────────────────────────────────
-- 픽스처
--   나(me)  : 집A 관리자(가족 있음) · 집B 유일 멤버 · 집C 일반 구성원
--   가족(fam): 집A 구성원
--   방장(host): 집C 관리자
-- ─────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','me@del.test','x',now(),now(),'{"full_name":"나"}'),
  ('d0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fam@del.test','x',now(),now(),'{"full_name":"가족"}'),
  ('d0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','host@del.test','x',now(),now(),'{"full_name":"방장"}');

insert into households (id, name, created_by) values
  ('d0000001-0000-0000-0000-00000000000a','집A','d0000000-0000-0000-0000-000000000001'),
  ('d0000001-0000-0000-0000-00000000000b','집B','d0000000-0000-0000-0000-000000000001'),
  ('d0000001-0000-0000-0000-00000000000c','집C','d0000000-0000-0000-0000-000000000003');

insert into household_members (household_id, user_id, role, joined_at) values
  ('d0000001-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000001','owner', now() - interval '10 days'),
  ('d0000001-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-000000000002','member',now() - interval '5 days'),
  ('d0000001-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-000000000001','owner', now() - interval '10 days'),
  ('d0000001-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-000000000003','owner', now() - interval '9 days'),
  ('d0000001-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-000000000001','member',now() - interval '2 days');

-- 집B 에 실제 데이터를 넣어 "통째로 사라진다" 를 확인할 수 있게 한다
insert into locations (id, household_id, name, created_by, updated_by)
  values ('d0000002-0000-0000-0000-00000000000b','d0000001-0000-0000-0000-00000000000b','창고','d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001');
insert into items (id, household_id, location_id, name, created_by, updated_by)
  values ('d0000003-0000-0000-0000-00000000000b','d0000001-0000-0000-0000-00000000000b','d0000002-0000-0000-0000-00000000000b','집B물건','d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001');
-- 집A 에도 내가 만든 물건을 둔다 — 내가 떠나도 **남아야** 한다 (감사 이력 AC20/AC21)
insert into locations (id, household_id, name, created_by, updated_by)
  values ('d0000002-0000-0000-0000-00000000000a','d0000001-0000-0000-0000-00000000000a','거실','d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001');
insert into items (id, household_id, location_id, name, created_by, updated_by)
  values ('d0000003-0000-0000-0000-00000000000a','d0000001-0000-0000-0000-00000000000a','d0000002-0000-0000-0000-00000000000a','집A물건','d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001');


-- ═════════════════════════════════════════════════════════════
-- [1] 미리보기 — 무엇이 사라지는지 먼저 정확히 센다
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((account_deletion_preview() ->> 'doomed_count')::int, 1,
  '[1] 통째로 사라질 집은 1개다 (나 혼자인 집B)');
select is((account_deletion_preview() -> 'doomed_households' ->> 0)::uuid,
  'd0000001-0000-0000-0000-00000000000b'::uuid,
  '[1] 그 집은 집B 다');
select is((account_deletion_preview() ->> 'leaving_count')::int, 2,
  '[1] 나가기만 하는 집은 2개다 (집A·집C)');


-- ═════════════════════════════════════════════════════════════
-- [2] 탈퇴 실행
-- ═════════════════════════════════════════════════════════════
select lives_ok($$select delete_account()$$, '[2] 탈퇴가 성공한다');
reset role;

select is((select count(*)::int from household_members
    where user_id = 'd0000000-0000-0000-0000-000000000001'), 0,
  '[2] 어느 집에도 남아 있지 않다');


-- ═════════════════════════════════════════════════════════════
-- [3] 관리자 승계 — 집A 는 남고, 가족이 관리자가 된다
-- ═════════════════════════════════════════════════════════════
select is((select count(*)::int from households where id = 'd0000001-0000-0000-0000-00000000000a'), 1,
  '[3] 집A 는 그대로 남는다');
select is((select role from household_members
    where household_id = 'd0000001-0000-0000-0000-00000000000a'
      and user_id = 'd0000000-0000-0000-0000-000000000002'), 'owner',
  '[3] 남은 가족이 관리자가 됐다');
select is((select count(*)::int from household_members
    where household_id = 'd0000001-0000-0000-0000-00000000000a' and role = 'owner'), 1,
  '[3] 집A 의 관리자는 정확히 한 명이다 (주인 없는 집이 되지 않는다)');
select is((select count(*)::int from items where id = 'd0000003-0000-0000-0000-00000000000a'), 1,
  '[3] 내가 등록했던 물건은 집A 에 남는다');


-- ═════════════════════════════════════════════════════════════
-- [4] 혼자인 집 — 집B 는 데이터까지 통째로 사라진다
-- ═════════════════════════════════════════════════════════════
select is((select count(*)::int from households  where id = 'd0000001-0000-0000-0000-00000000000b'), 0, '[4] 집B 가 사라졌다');
select is((select count(*)::int from locations   where household_id = 'd0000001-0000-0000-0000-00000000000b'), 0, '[4] 집B 의 장소도 사라졌다');
select is((select count(*)::int from items       where household_id = 'd0000001-0000-0000-0000-00000000000b'), 0, '[4] 집B 의 물건도 사라졌다');
select is((select count(*)::int from item_events where household_id = 'd0000001-0000-0000-0000-00000000000b'), 0, '[4] 집B 의 이력도 사라졌다');
select is((select count(*)::int from invites     where household_id = 'd0000001-0000-0000-0000-00000000000b'), 0, '[4] 집B 의 초대 코드도 사라졌다');


-- ═════════════════════════════════════════════════════════════
-- [5] 구성원으로만 있던 집 — 집C 는 멀쩡하고 관리자도 그대로다
-- ═════════════════════════════════════════════════════════════
select is((select count(*)::int from households where id = 'd0000001-0000-0000-0000-00000000000c'), 1, '[5] 집C 는 남는다');
select is((select role from household_members
    where household_id = 'd0000001-0000-0000-0000-00000000000c'
      and user_id = 'd0000000-0000-0000-0000-000000000003'), 'owner',
  '[5] 집C 의 관리자는 바뀌지 않았다 (내가 관리자가 아니었으므로 승계가 없다)');


-- ═════════════════════════════════════════════════════════════
-- [6] 계정과 프로필 — 인증은 사라지고, 이름은 익명으로 남는다
-- ═════════════════════════════════════════════════════════════
select is((select count(*)::int from auth.users where id = 'd0000000-0000-0000-0000-000000000001'), 0,
  '[6] 인증 계정이 사라졌다 — 다시 로그인할 수 없다');
select is((select display_name from profiles where id = 'd0000000-0000-0000-0000-000000000001'),
  '탈퇴한 사용자',
  '[6] 프로필은 익명화되어 남는다 (감사 이력이 FK 로 물려 있다)');
select is((select created_by from items where id = 'd0000003-0000-0000-0000-00000000000a'),
  'd0000000-0000-0000-0000-000000000001'::uuid,
  '[6] 남은 물건의 created_by 는 그대로 — "누가 만들었나" 라는 사실은 지워지지 않는다');


-- ═════════════════════════════════════════════════════════════
-- [7] 구조 — profiles 가 auth.users 와 끊겨 있어야 이 전부가 성립한다
-- ═════════════════════════════════════════════════════════════
select is((select count(*)::int from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'f'
      and confrelid = 'auth.users'::regclass), 0,
  '[7] profiles → auth.users FK 가 없다 (있으면 탈퇴가 23503 으로 실패한다)');

select * from finish();
rollback;
