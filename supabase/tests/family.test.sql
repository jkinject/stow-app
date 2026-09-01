-- 홈 스토어 — 가족(구성원·초대) 관리 (2026-08-31)
--
-- 화면이 아니라 **DB** 를 검증한다. 가족 화면에서 막는 것들(마지막 관리자 이탈,
-- 남의 역할 바꾸기, 남의 초대 취소)은 전부 서버에서도 막혀야 한다 — 화면은
-- 언제든 하나 더 생기고, 그때 새 화면이 같은 검사를 다시 넣으리라는 보장이 없다.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ─────────────────────────────────────────────────────────────
-- 픽스처: 가구 F. o1(owner), o2(owner), m1(member), out(비멤버)
-- ─────────────────────────────────────────────────────────────
\set uo1 'f0000000-0000-0000-0000-0000000000o1'
\set hf  'f0000001-0000-0000-0000-00000000000f'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','o1@fam.test','x',now(),now(),'{"full_name":"주인하나"}'),
  ('f0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','o2@fam.test','x',now(),now(),'{"full_name":"주인둘"}'),
  ('f0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m1@fam.test','x',now(),now(),'{"full_name":"구성원"}'),
  ('f0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@fam.test','x',now(),now(),'{"full_name":"바깥사람"}');

insert into households (id, name, created_by)
  values ('f0000001-0000-0000-0000-00000000000f','가족테스트가구','f0000000-0000-0000-0000-000000000001');
insert into household_members (household_id, user_id, role) values
  ('f0000001-0000-0000-0000-00000000000f','f0000000-0000-0000-0000-000000000001','owner'),
  ('f0000001-0000-0000-0000-00000000000f','f0000000-0000-0000-0000-000000000003','member');

-- 코드는 가구당 한 장, 만료 없음 (2026-08-31)
insert into invites (id, household_id, code, created_by) values
  ('f0000002-0000-0000-0000-00000000000a','f0000001-0000-0000-0000-00000000000f','LIVECODE','f0000000-0000-0000-0000-000000000001');


-- ═════════════════════════════════════════════════════════════
-- [1] 권한 상승 — 구성원이 스스로 관리자가 될 수 없다
--     기존 hm_update 정책만으로는 못 막았다. t05_member_role_guard 의 몫.
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$update household_members set role = 'owner'
    where household_id = 'f0000001-0000-0000-0000-00000000000f'
      and user_id = 'f0000000-0000-0000-0000-000000000003'$$,
  '42501', null, '[1] 구성원은 스스로 관리자가 될 수 없다');

-- 알림 설정은 본인 것을 바꿀 수 있어야 한다 (AC17) — 역할만 막는 것이지 행을 잠근 게 아니다
select lives_ok(
  $$update household_members set notify_threshold = false
    where household_id = 'f0000001-0000-0000-0000-00000000000f'
      and user_id = 'f0000000-0000-0000-0000-000000000003'$$,
  '[1] 본인 알림 설정은 바꿀 수 있다');
select is(
  (select notify_threshold from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f'
      and user_id = 'f0000000-0000-0000-0000-000000000003'),
  false, '[1] 알림 설정이 실제로 반영됐다');

-- 구성원은 코드를 볼 수는 있어도 바꿀 수는 없다.
-- 바꾸는 순간 남이 가진 코드가 전부 죽기 때문에 관리자만 할 수 있어야 한다.
select is((select code from invites where household_id = 'f0000001-0000-0000-0000-00000000000f'),
  'LIVECODE', '[1] 구성원도 우리 집 코드는 볼 수 있다 (가족에게 보내야 하니까)');

update invites set code = 'MEMBERCD' where household_id = 'f0000001-0000-0000-0000-00000000000f';
select is((select code from invites where household_id = 'f0000001-0000-0000-0000-00000000000f'),
  'LIVECODE', '[1] 구성원의 코드 변경은 0행 처리된다 (코드가 그대로다)');

select throws_ok(
  $$select rotate_invite('f0000001-0000-0000-0000-00000000000f')$$,
  '42501', null, '[1] 구성원은 rotate_invite 를 부를 수 없다');

-- 구성원은 남을 내보낼 수 없다
delete from household_members
  where household_id = 'f0000001-0000-0000-0000-00000000000f'
    and user_id = 'f0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f'), 2,
  '[1] 구성원은 관리자를 내보낼 수 없다');

reset role;


-- ⚠⚠ 이 검사는 실제로 난 버그를 고정한다 (2026-08-31, 사용자 보고).
--    `hm_select` 는 `is_household_member(household_id)` 라서 **내 행만** 주는 게 아니라
--    그 가구 **구성원 전원의 행**을 준다. 클라이언트가 `user_id` 로 거르지 않으면
--    같은 가구가 여러 번 돌아오고, 첫 행(가장 먼저 들어온 사람 = 대개 관리자)의 role 을
--    자기 역할로 착각한다. 그래서 **구성원 화면에 관리자 메뉴가 떴다.**
--    RLS 를 느슨하게 바꿔 고치려 들면 안 된다 — 구성원 목록(가족 화면)이 이 정책으로
--    돌아간다. 거르는 쪽은 질의다.
select is((select count(*)::int from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f'), 2,
  '[1] 구성원에게도 **가구 전원**의 행이 보인다 — 그래서 클라이언트가 user_id 로 걸러야 한다');
select is((select role from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f' and user_id = auth.uid()),
  'member', '[1] user_id 로 거르면 내 진짜 역할이 나온다');


-- ═════════════════════════════════════════════════════════════
-- [2] 비멤버 — 구성원 목록도 초대 코드도 보이지 않는다
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f'), 0,
  '[2] 비멤버에게 구성원 목록은 0행');
select is((select count(*)::int from invites
    where household_id = 'f0000001-0000-0000-0000-00000000000f'), 0,
  '[2] 비멤버에게 초대 코드는 0행');
select is((select count(*)::int from households
    where id = 'f0000001-0000-0000-0000-00000000000f'), 0,
  '[2] 비멤버에게 가구는 0행');

-- 코드를 알면 accept_invite 로는 들어올 수 있다 — 그게 초대의 정의다 (AC25)
select lives_ok($$select accept_invite('LIVECODE')$$, '[2] 코드로 참여할 수 있다');
select is((select role from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f'
      and user_id = 'f0000000-0000-0000-0000-000000000004'), 'member',
  '[2] 참여자는 member 로 들어온다');
select throws_ok($$select accept_invite('NOSUCHCD')$$, null, null,
  '[2] 없는 코드로는 참여할 수 없다');

reset role;


-- ═════════════════════════════════════════════════════════════
-- [3] 관리자 — 역할 변경 / 내보내기 / 초대 취소
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$update household_members set role = 'owner'
    where household_id = 'f0000001-0000-0000-0000-00000000000f'
      and user_id = 'f0000000-0000-0000-0000-000000000003'$$,
  '[3] 관리자는 남을 관리자로 지정할 수 있다');
select is((select count(*)::int from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f' and role = 'owner'), 2,
  '[3] 관리자가 2명이 됐다');

-- 코드 바꾸기가 영구 코드에서 유일한 회수 수단이다
select lives_ok(
  $$select rotate_invite('f0000001-0000-0000-0000-00000000000f')$$,
  '[3] 관리자는 코드를 바꿀 수 있다');
select isnt((select code from invites where household_id = 'f0000001-0000-0000-0000-00000000000f'),
  'LIVECODE', '[3] 코드가 실제로 바뀌었다');
select is((select count(*)::int from invites where household_id = 'f0000001-0000-0000-0000-00000000000f'),
  1, '[3] 바꾼 뒤에도 코드는 여전히 한 장이다');

-- 관리자도 코드를 지울 수는 없다 — 코드 없는 집이라는 상태를 만들지 않는다
delete from invites where household_id = 'f0000001-0000-0000-0000-00000000000f';
select is((select count(*)::int from invites where household_id = 'f0000001-0000-0000-0000-00000000000f'),
  1, '[3] 코드 삭제는 0행 처리된다 (DELETE 정책 없음)');

-- 바꾼 뒤에는 옛 코드가 죽는다 — 내보낸 사람이 다시 들어오지 못하게 하는 근거다
reset role;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select accept_invite('LIVECODE')$$, null, null,
  '[3] 바뀌기 전의 옛 코드로는 더 이상 참여할 수 없다');
reset role;

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$delete from household_members
     where household_id = 'f0000001-0000-0000-0000-00000000000f'
       and user_id = 'f0000000-0000-0000-0000-000000000004'$$,
  '[3] 관리자는 구성원을 내보낼 수 있다');

select lives_ok(
  $$update households set name = '이름바꿈'
     where id = 'f0000001-0000-0000-0000-00000000000f'$$,
  '[3] 관리자는 집 이름을 바꿀 수 있다');
select is((select name from households where id = 'f0000001-0000-0000-0000-00000000000f'),
  '이름바꿈', '[3] 집 이름이 실제로 바뀌었다');


-- ═════════════════════════════════════════════════════════════
-- [4] 마지막 관리자 보호 (t06_last_owner_guard)
--     지금 관리자는 o1, m1 두 명이다.
-- ═════════════════════════════════════════════════════════════
select lives_ok(
  $$delete from household_members
     where household_id = 'f0000001-0000-0000-0000-00000000000f'
       and user_id = 'f0000000-0000-0000-0000-000000000001'$$,
  '[4] 관리자가 둘일 때는 한 명이 나갈 수 있다');

reset role;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f' and role = 'owner'), 1,
  '[4] 이제 관리자는 한 명뿐이다');

select throws_ok(
  $$delete from household_members
     where household_id = 'f0000001-0000-0000-0000-00000000000f'
       and user_id = 'f0000000-0000-0000-0000-000000000003'$$,
  '23001', null, '[4] 마지막 관리자는 나갈 수 없다');

select throws_ok(
  $$update household_members set role = 'member'
     where household_id = 'f0000001-0000-0000-0000-00000000000f'
       and user_id = 'f0000000-0000-0000-0000-000000000003'$$,
  '23001', null, '[4] 마지막 관리자는 스스로 강등할 수도 없다');

select is((select count(*)::int from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f'), 1,
  '[4] 거부 뒤에도 구성원은 그대로다');

reset role;


-- ═════════════════════════════════════════════════════════════
-- [5] 가구 삭제 cascade — 마지막 관리자 보호가 삭제를 막으면 안 된다
--     (막으면 M9 계정 삭제 경로가 통째로 걸린다)
-- ═════════════════════════════════════════════════════════════
select lives_ok(
  $$delete from households where id = 'f0000001-0000-0000-0000-00000000000f'$$,
  '[5] 가구 삭제 cascade 는 마지막 관리자 보호에 걸리지 않는다');
select is((select count(*)::int from household_members
    where household_id = 'f0000001-0000-0000-0000-00000000000f'), 0,
  '[5] 구성원도 함께 정리됐다');


-- ═════════════════════════════════════════════════════════════
-- [6] 구조 — 정책과 트리거가 실제로 붙어 있는가
-- ═════════════════════════════════════════════════════════════
select is((select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'household_members' and cmd = 'UPDATE'), 2,
  '[6] household_members UPDATE 정책은 본인용·관리자용 2개다');
select is((select count(*)::int from pg_trigger
    where tgrelid = 'public.household_members'::regclass
      and tgname in ('t05_member_role_guard','t06_last_owner_guard')), 2,
  '[6] 가드 트리거 2개가 붙어 있다');
select is((select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'invites' and cmd = 'DELETE'), 0,
  '[6] invites 에 DELETE 정책이 없다 — 코드 없는 집은 만들 수 없다');
select ok(exists (select 1 from pg_constraint
    where conname = 'invites_household_uniq' and contype = 'u'),
  '[6] 가구당 초대 코드는 한 행이라는 제약이 있다');


-- ═════════════════════════════════════════════════════════════
-- [7] create_household 는 집과 코드를 함께 만든다
--     따로 만들게 두면 "코드 없는 집" 이라는 상태가 생기고, 그 상태를 화면마다
--     다시 다뤄야 한다.
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$select create_household('새로만든집')$$, '[7] 가구를 만들 수 있다');
select is(
  (select count(*)::int from invites i
     join households h on h.id = i.household_id
    where h.name = '새로만든집'),
  1, '[7] 만들자마자 초대 코드가 한 장 함께 생긴다');
select matches(
  (select i.code from invites i join households h on h.id = i.household_id where h.name = '새로만든집'),
  '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$',
  '[7] 코드는 혼동하기 쉬운 글자(0 O 1 I L)를 쓰지 않는 8자리다');

reset role;

select * from finish();
rollback;
