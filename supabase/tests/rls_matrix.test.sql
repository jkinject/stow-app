-- 홈 스토어 — RLS 권한 매트릭스 전수 대조 (R18, AC27)
--
-- 12개 테이블 × 4작업 = 48칸을 **두 방향으로** 검증한다:
--   (1) 동작: 자기 가구의 owner 로서 각 작업을 실제로 시도해 allow/deny 를 확인
--   (2) 구조: pg_policies 에 정책이 있어야 할 칸에만 있는지 대조
--
-- ⚠ R2(RLS 미활성 → 유출)와 R18(RLS 활성 + 정책 없음 → 전면 거부)은 반대 방향의
--   실패다. "rowsecurity=false 0행" 검사는 R18 을 절대 잡지 못한다. 이 파일이 그 몫이다.
--
-- 거부의 형태는 두 가지다 (실측):
--   INSERT 거부 → 42501 예외
--   SELECT/UPDATE/DELETE 거부 → 0행 (예외 아님)
-- 따라서 probe 는 둘 다 'deny' 로 정규화한다.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create or replace function pg_temp.probe(p_sql text) returns text language plpgsql as $fn$
declare n int;
begin
  begin
    execute p_sql into n;
    raise exception 'PROBE_ROLLBACK:%', coalesce(n,0);   -- 성공해도 부트랜잭션을 되돌린다
  exception
    when insufficient_privilege then return 'deny';       -- 42501
    when raise_exception then
      if sqlerrm like 'PROBE_ROLLBACK:%' then
        if split_part(sqlerrm, ':', 2)::int > 0 then return 'allow'; else return 'deny'; end if;
      end if;
      return 'err(P0001)';
    when others then return 'err(' || sqlstate || ')';
  end;
end $fn$;


-- 픽스처: 가구 A, 사용자 a(owner). 12개 테이블 전부에 A 소유 행이 있어야
-- "0행 = 거부" 판정이 "0행 = 대상 없음" 과 혼동되지 않는다.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data)
values ('aaaa0000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','matrix@test.io','x',now(),now(),'{"full_name":"매트릭스"}');
insert into households (id,name,created_by) values ('aaaa0001-0000-0000-0000-00000000000a','매트릭스가구','aaaa0000-0000-0000-0000-00000000000a');
insert into household_members values ('aaaa0001-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000a','owner');

-- ⚠ 두 번째 owner 는 장식이 아니다. household_members.DELETE 칸은 **정책**이 본인 탈퇴를
--   허용하는지 보는 자리인데, owner 가 한 명뿐이면 t06_last_owner_guard(마지막 관리자 보호)
--   가 먼저 튕겨서 정책까지 가보지도 못하고 err(23001) 이 된다. 두 겹을 섞지 않으려고
--   여기서는 관리자를 둘로 둔다. 가드 자체는 family.test.sql 이 따로 검증한다.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data)
values ('aaaa0000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','matrix2@test.io','x',now(),now(),'{"full_name":"매트릭스둘"}');
insert into household_members values ('aaaa0001-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000b','owner');
insert into locations (id,household_id,name,created_by,updated_by) values ('aaaa0002-0000-0000-0000-00000000000a','aaaa0001-0000-0000-0000-00000000000a','장소','aaaa0000-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000a');
insert into containers (id,household_id,location_id,name,created_by,updated_by) values ('aaaa0003-0000-0000-0000-00000000000a','aaaa0001-0000-0000-0000-00000000000a','aaaa0002-0000-0000-0000-00000000000a','박스','aaaa0000-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000a');
insert into items (id,household_id,location_id,name,created_by,updated_by) values ('aaaa0004-0000-0000-0000-00000000000a','aaaa0001-0000-0000-0000-00000000000a','aaaa0002-0000-0000-0000-00000000000a','물건','aaaa0000-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000a');
-- ⚠ shopping_list INSERT 프로브용 별도 물건. aaaa0004-0000-0000-0000-00000000000a 에는 이미 미해결 항목이 있어
--   one_open_per_item 유니크 제약에 걸린다 (정책이 아니라 제약).
insert into items (id,household_id,location_id,name,created_by,updated_by) values ('aaaa0008-0000-0000-0000-00000000000a','aaaa0001-0000-0000-0000-00000000000a','aaaa0002-0000-0000-0000-00000000000a','두번째 물건','aaaa0000-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000a');
insert into invites (id,household_id,code,created_by) values ('aaaa0005-0000-0000-0000-00000000000a','aaaa0001-0000-0000-0000-00000000000a','MTXCODE1','aaaa0000-0000-0000-0000-00000000000a');
-- ⚠ invites 는 가구당 한 행이다. INSERT 칸을 시험하려면 **아직 코드가 없는** 가구가
--   있어야 한다 — 같은 가구에 또 넣으면 정책이 아니라 unique 제약이 먼저 튕긴다.
insert into households (id,name,created_by) values ('aaaa0006-0000-0000-0000-00000000000a','코드없는가구','aaaa0000-0000-0000-0000-00000000000a');
insert into household_members values ('aaaa0006-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000a','owner');
insert into shopping_list (id,household_id,item_id,added_reason) values ('aaaa0006-0000-0000-0000-00000000000a','aaaa0001-0000-0000-0000-00000000000a','aaaa0004-0000-0000-0000-00000000000a','manual');
insert into device_push_tokens (id,user_id,expo_token,platform) values ('aaaa0007-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000a','ExponentPushToken[mtx]','ios');
insert into maintenance_log (job,candidate_count,deleted_count) values ('probe',0,0);

-- 물건당 미해결 항목 1건 제약이 실제로 작동하는지 (위 예외의 근거)
select throws_ok(
  $$insert into shopping_list (household_id,item_id,added_reason) values ('aaaa0001-0000-0000-0000-00000000000a','aaaa0004-0000-0000-0000-00000000000a','manual')$$,
  '23505', null, '[제약] 물건당 미해결 구매항목은 1건뿐이다');

select set_config('request.jwt.claims','{"sub":"aaaa0000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
set local role authenticated;

-- ═════════════════════════════════════════════════════════════
-- (1) 동작 대조 — 48칸
-- ═════════════════════════════════════════════════════════════
select is(pg_temp.probe('select count(*)::int from profiles where id=''aaaa0000-0000-0000-0000-00000000000a'''), 'allow', '[profiles.SELECT] allow — 본인 프로필 (AC20 표시 이름)');
select is(pg_temp.probe('with x as (insert into profiles (id,display_name) values (gen_random_uuid(),''신규'') returning 1) select count(*)::int from x'), 'deny', '[profiles.INSERT] deny — 가입 트리거만 생성');
select is(pg_temp.probe('with x as (update profiles set display_name=''바뀜'' where id=''aaaa0000-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[profiles.UPDATE] allow — 본인만');
select is(pg_temp.probe('with x as (delete from profiles where id=''aaaa0000-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[profiles.DELETE] deny — 계정 삭제는 M9 익명화 경로');
select is(pg_temp.probe('select count(*)::int from households where id=''aaaa0001-0000-0000-0000-00000000000a'''), 'allow', '[households.SELECT] allow — 멤버');
select is(pg_temp.probe('with x as (insert into households (name,created_by) values (''직접'',''aaaa0000-0000-0000-0000-00000000000a'') returning 1) select count(*)::int from x'), 'deny', '[households.INSERT] deny — 닭과 달걀 — create_household RPC 만');
select is(pg_temp.probe('with x as (update households set name=''개명'' where id=''aaaa0001-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[households.UPDATE] allow — owner');
select is(pg_temp.probe('with x as (delete from households where id=''aaaa0001-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[households.DELETE] deny — M9 계정 삭제 경로에서만');
select is(pg_temp.probe('select count(*)::int from household_members where household_id=''aaaa0001-0000-0000-0000-00000000000a'''), 'allow', '[household_members.SELECT] allow — 멤버');
select is(pg_temp.probe('with x as (insert into household_members (household_id,user_id,role) values (''aaaa0001-0000-0000-0000-00000000000a'',''aaaa0000-0000-0000-0000-00000000000a'',''member'') returning 1) select count(*)::int from x'), 'deny', '[household_members.INSERT] deny — create_household / accept_invite RPC 만 (P3)');
select is(pg_temp.probe('with x as (update household_members set notify_threshold=false where household_id=''aaaa0001-0000-0000-0000-00000000000a'' and user_id=''aaaa0000-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[household_members.UPDATE] allow — 본인 알림 설정 (AC17)');
select is(pg_temp.probe('with x as (delete from household_members where household_id=''aaaa0001-0000-0000-0000-00000000000a'' and user_id=''aaaa0000-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[household_members.DELETE] allow — owner 추방 또는 본인 탈퇴 (AC26)');
select is(pg_temp.probe('select count(*)::int from invites where household_id=''aaaa0001-0000-0000-0000-00000000000a'''), 'allow', '[invites.SELECT] allow — 멤버');
select is(pg_temp.probe('with x as (insert into invites (household_id,code,created_by) values (''aaaa0006-0000-0000-0000-00000000000a'',''NEWCODE1'',''aaaa0000-0000-0000-0000-00000000000a'') returning 1) select count(*)::int from x'), 'allow', '[invites.INSERT] allow — owner (코드 없는 가구 복구용)');
select is(pg_temp.probe('with x as (update invites set code=''ROTATED1'' where id=''aaaa0005-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[invites.UPDATE] allow — owner 코드 바꾸기 = 회수 수단');
select is(pg_temp.probe('with x as (delete from invites where id=''aaaa0005-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[invites.DELETE] deny — 코드 없는 집을 만들 수 없다 (회수는 UPDATE 로)');
select is(pg_temp.probe('select count(*)::int from locations where id=''aaaa0002-0000-0000-0000-00000000000a'''), 'allow', '[locations.SELECT] allow — 가구 스코프');
select is(pg_temp.probe('with x as (insert into locations (household_id,name,created_by,updated_by) values (''aaaa0001-0000-0000-0000-00000000000a'',''새장소'',''aaaa0000-0000-0000-0000-00000000000a'',''aaaa0000-0000-0000-0000-00000000000a'') returning 1) select count(*)::int from x'), 'allow', '[locations.INSERT] allow — 가구 스코프');
select is(pg_temp.probe('with x as (update locations set name=''변경'' where id=''aaaa0002-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[locations.UPDATE] allow — 가구 스코프');
select is(pg_temp.probe('with x as (delete from locations where id=''aaaa0002-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[locations.DELETE] deny — soft delete 만 (AC24)');
select is(pg_temp.probe('select count(*)::int from containers where id=''aaaa0003-0000-0000-0000-00000000000a'''), 'allow', '[containers.SELECT] allow — 가구 스코프');
select is(pg_temp.probe('with x as (insert into containers (household_id,location_id,name,created_by,updated_by) values (''aaaa0001-0000-0000-0000-00000000000a'',''aaaa0002-0000-0000-0000-00000000000a'',''새박스'',''aaaa0000-0000-0000-0000-00000000000a'',''aaaa0000-0000-0000-0000-00000000000a'') returning 1) select count(*)::int from x'), 'allow', '[containers.INSERT] allow — 가구 스코프');
select is(pg_temp.probe('with x as (update containers set name=''변경'' where id=''aaaa0003-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[containers.UPDATE] allow — 가구 스코프');
select is(pg_temp.probe('with x as (delete from containers where id=''aaaa0003-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[containers.DELETE] deny — soft delete 만 (AC24)');
select is(pg_temp.probe('select count(*)::int from items where id=''aaaa0004-0000-0000-0000-00000000000a'''), 'allow', '[items.SELECT] allow — 가구 스코프');
select is(pg_temp.probe('with x as (insert into items (id,household_id,location_id,name,created_by,updated_by) values (gen_random_uuid(),''aaaa0001-0000-0000-0000-00000000000a'',''aaaa0002-0000-0000-0000-00000000000a'',''새물건'',''aaaa0000-0000-0000-0000-00000000000a'',''aaaa0000-0000-0000-0000-00000000000a'') returning 1) select count(*)::int from x'), 'allow', '[items.INSERT] allow — 가구 스코프');
select is(pg_temp.probe('with x as (update items set name=''변경'' where id=''aaaa0004-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[items.UPDATE] allow — 가구 스코프');
select is(pg_temp.probe('with x as (delete from items where id=''aaaa0004-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[items.DELETE] deny — soft delete 만 (AC24)');
select is(pg_temp.probe('select count(*)::int from item_events where household_id=''aaaa0001-0000-0000-0000-00000000000a'''), 'allow', '[item_events.SELECT] allow — 이력 열람 (AC21)');
select is(pg_temp.probe('with x as (insert into item_events (household_id,item_id,actor_id,type) values (''aaaa0001-0000-0000-0000-00000000000a'',''aaaa0004-0000-0000-0000-00000000000a'',''aaaa0000-0000-0000-0000-00000000000a'',''updated'') returning 1) select count(*)::int from x'), 'deny', '[item_events.INSERT] deny — t30 트리거만 (P3)');
select is(pg_temp.probe('with x as (update item_events set type=''updated'' where household_id=''aaaa0001-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[item_events.UPDATE] deny — append-only (P3)');
select is(pg_temp.probe('with x as (delete from item_events where household_id=''aaaa0001-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[item_events.DELETE] deny — append-only (P3)');
select is(pg_temp.probe('select count(*)::int from shopping_list where household_id=''aaaa0001-0000-0000-0000-00000000000a'''), 'allow', '[shopping_list.SELECT] allow — 가구 스코프');
select is(pg_temp.probe('with x as (insert into shopping_list (household_id,item_id,added_reason) values (''aaaa0001-0000-0000-0000-00000000000a'',''aaaa0008-0000-0000-0000-00000000000a'',''manual'') returning 1) select count(*)::int from x'), 'allow', '[shopping_list.INSERT] allow — 수동 추가만');
select is(pg_temp.probe('with x as (update shopping_list set resolved_at=now() where id=''aaaa0006-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'deny', '[shopping_list.UPDATE] deny — resolved_by 는 resolve_shopping_item RPC 만 (P3)');
select is(pg_temp.probe('with x as (delete from shopping_list where id=''aaaa0006-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[shopping_list.DELETE] allow — 수동 항목만');
select is(pg_temp.probe('select count(*)::int from device_push_tokens where user_id=''aaaa0000-0000-0000-0000-00000000000a'''), 'allow', '[device_push_tokens.SELECT] allow — 본인');
select is(pg_temp.probe('with x as (insert into device_push_tokens (user_id,expo_token,platform) values (''aaaa0000-0000-0000-0000-00000000000a'',''ExponentPushToken[new]'',''android'') returning 1) select count(*)::int from x'), 'allow', '[device_push_tokens.INSERT] allow — 본인');
select is(pg_temp.probe('with x as (update device_push_tokens set platform=''android'' where id=''aaaa0007-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[device_push_tokens.UPDATE] allow — 본인');
select is(pg_temp.probe('with x as (delete from device_push_tokens where id=''aaaa0007-0000-0000-0000-00000000000a'' returning 1) select count(*)::int from x'), 'allow', '[device_push_tokens.DELETE] allow — 본인');
select is(pg_temp.probe('select count(*)::int from maintenance_log'), 'deny', '[maintenance_log.SELECT] deny — 크론 전용');
select is(pg_temp.probe('with x as (insert into maintenance_log (job,candidate_count) values (''hack'',1) returning 1) select count(*)::int from x'), 'deny', '[maintenance_log.INSERT] deny — 크론 전용');
select is(pg_temp.probe('with x as (update maintenance_log set job=''hack'' returning 1) select count(*)::int from x'), 'deny', '[maintenance_log.UPDATE] deny — 크론 전용');
select is(pg_temp.probe('with x as (delete from maintenance_log returning 1) select count(*)::int from x'), 'deny', '[maintenance_log.DELETE] deny — 크론 전용');
select is(pg_temp.probe('select count(*)::int from app_settings'), 'allow', '[app_settings.SELECT] allow — 클라이언트가 상한값을 알아야 안내 가능');
select is(pg_temp.probe('with x as (insert into app_settings (key,value) values (''hack'',''1'') returning 1) select count(*)::int from x'), 'deny', '[app_settings.INSERT] deny — 운영자가 직접');
select is(pg_temp.probe('with x as (update app_settings set value=''999'' where key=''items_max_per_household'' returning 1) select count(*)::int from x'), 'deny', '[app_settings.UPDATE] deny — 운영자가 직접');
select is(pg_temp.probe('with x as (delete from app_settings where key=''items_max_per_household'' returning 1) select count(*)::int from x'), 'deny', '[app_settings.DELETE] deny — 운영자가 직접');

-- ═════════════════════════════════════════════════════════════
-- (2) 구조 대조 — 정책이 있어야 할 칸에만 있는가
-- cmd='ALL' 정책은 4작업 모두를 덮는 것으로 계산한다 (device_push_tokens)
-- ═════════════════════════════════════════════════════════════
reset role;

create temp table expected_cells(tbl text, cmd text, want boolean);
insert into expected_cells values
  ('profiles','SELECT',true),
  ('profiles','INSERT',false),
  ('profiles','UPDATE',true),
  ('profiles','DELETE',false),
  ('households','SELECT',true),
  ('households','INSERT',false),
  ('households','UPDATE',true),
  ('households','DELETE',false),
  ('household_members','SELECT',true),
  ('household_members','INSERT',false),
  ('household_members','UPDATE',true),
  ('household_members','DELETE',true),
  ('invites','SELECT',true),
  ('invites','INSERT',true),
  ('invites','UPDATE',true),
  ('invites','DELETE',false),
  ('locations','SELECT',true),
  ('locations','INSERT',true),
  ('locations','UPDATE',true),
  ('locations','DELETE',false),
  ('containers','SELECT',true),
  ('containers','INSERT',true),
  ('containers','UPDATE',true),
  ('containers','DELETE',false),
  ('items','SELECT',true),
  ('items','INSERT',true),
  ('items','UPDATE',true),
  ('items','DELETE',false),
  ('item_events','SELECT',true),
  ('item_events','INSERT',false),
  ('item_events','UPDATE',false),
  ('item_events','DELETE',false),
  ('shopping_list','SELECT',true),
  ('shopping_list','INSERT',true),
  ('shopping_list','UPDATE',false),
  ('shopping_list','DELETE',true),
  ('device_push_tokens','SELECT',true),
  ('device_push_tokens','INSERT',true),
  ('device_push_tokens','UPDATE',true),
  ('device_push_tokens','DELETE',true),
  ('maintenance_log','SELECT',false),
  ('maintenance_log','INSERT',false),
  ('maintenance_log','UPDATE',false),
  ('maintenance_log','DELETE',false),
  ('app_settings','SELECT',true),
  ('app_settings','INSERT',false),
  ('app_settings','UPDATE',false),
  ('app_settings','DELETE',false);

-- 실제 정책 존재 여부 (ALL 은 4작업으로 전개)
create temp view actual_cells as
select p.tablename tbl, c.cmd, true has
  from pg_policies p
  cross join lateral (
    select unnest(case when p.cmd='ALL' then array['SELECT','INSERT','UPDATE','DELETE'] else array[p.cmd] end) cmd
  ) c
 where p.schemaname='public'
 group by p.tablename, c.cmd;

select is(
  (select count(*)::int from expected_cells e
     left join actual_cells a on a.tbl=e.tbl and a.cmd=e.cmd
    where e.want and a.has is null),
  0, '[구조] 허용되어야 할 칸에 정책이 빠진 곳이 없다 (R18: 정책 없으면 전면 거부)');

select is(
  (select count(*)::int from expected_cells e
     join actual_cells a on a.tbl=e.tbl and a.cmd=e.cmd
    where not e.want),
  0, '[구조] 거부되어야 할 칸에 정책이 잘못 붙은 곳이 없다');

select is((select count(*)::int from expected_cells), 48,
  '[구조] 매트릭스가 12개 테이블 × 4작업 = 48칸을 모두 덮는다');

select * from finish();
rollback;