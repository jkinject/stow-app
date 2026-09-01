-- 홈 스토어 — 계정 탈퇴 (2026-08-31)
--
-- 스토어 심사 필수 항목이면서, 사용자가 정한 규칙이 있다:
--   · 내가 관리자인 집에 다른 가족이 있으면 → **관리자를 넘기고** 나만 나간다
--   · 넘길 가족이 없으면 (나 혼자인 집) → **집과 데이터를 통째로 삭제**한다
--   · 내가 관리자가 아니면 → 그냥 나간다
--
-- ═════════════════════════════════════════════════════════════
-- ⚠ 먼저 풀어야 할 매듭: profiles ↔ auth.users
--
--   `profiles.id → auth.users(id) ON DELETE CASCADE` 였다. 그래서 인증 계정을 지우면
--   프로필도 함께 지워지는데, 프로필을 가리키는 FK 가 **10개** 남아 있다
--   (categories/containers/households/invites/items/locations 의 created_by·updated_by,
--    전부 ON DELETE NO ACTION). 결과는 23503 — **탈퇴 자체가 실패한다.**
--
--   두 가지를 동시에 만족해야 한다:
--     (1) 감사 이력(AC20/AC21)은 남아야 한다 → 프로필 행을 지울 수 없다
--     (2) 탈퇴했으면 다시 로그인되면 안 된다  → 인증 계정은 지워야 한다
--
--   그래서 **둘을 끊는다.** profiles 는 auth.users 를 참조하지 않는 독립 테이블이 된다.
--   인증 계정은 지우고, 프로필 행은 '탈퇴한 사용자' 로 익명화해 남긴다.
--   신규 가입 트리거(on_auth_user_created)는 그대로 동작한다 — INSERT 에 FK 가
--   필요했던 게 아니라 auth.users 가 원본이었을 뿐이다.
-- ═════════════════════════════════════════════════════════════
alter table public.profiles drop constraint if exists profiles_id_fkey;

comment on table public.profiles is
  '표시 이름. auth.users 와 FK 로 묶지 않는다 — 탈퇴 시 인증 계정만 지우고 이 행은 익명화해 남겨야 감사 이력이 살아남는다 (계획 M9, R26)';

-- ═════════════════════════════════════════════════════════════
-- account_deletion_preview — 무엇이 사라지는지 먼저 알려준다
--
-- 확인 창에 "집 2개가 함께 삭제됩니다" 라고 쓰려면 미리 세어야 한다.
-- 사진 경로도 같이 돌려준다 — Storage 객체는 SQL 로 지울 수 없어서(파일 실체는
-- 스토리지 계층에 있다) 클라이언트가 정식 API 로 지워야 한다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.account_deletion_preview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_doomed uuid[];
  v_paths text[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

  -- 나 혼자인 집 = 통째로 사라질 집
  select coalesce(array_agg(hm.household_id), '{}')
    into v_doomed
  from household_members hm
  where hm.user_id = v_uid
    and not exists (
      select 1 from household_members o
      where o.household_id = hm.household_id and o.user_id <> v_uid
    );

  select coalesce(array_agg(p), '{}') into v_paths
  from (
    select unnest(array[photo_path, thumb_path]) as p
      from items where household_id = any(v_doomed)
    union
    select unnest(array[photo_path, thumb_path])
      from containers where household_id = any(v_doomed)
  ) x
  where p is not null;

  return jsonb_build_object(
    'doomed_households', v_doomed,
    'doomed_count',      coalesce(array_length(v_doomed, 1), 0),
    'leaving_count',     (select count(*) from household_members where user_id = v_uid)
                         - coalesce(array_length(v_doomed, 1), 0),
    'photo_paths',       v_paths
  );
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- delete_account — 실제 탈퇴
-- ═════════════════════════════════════════════════════════════
create or replace function public.delete_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_m       record;
  v_heir    uuid;
  v_deleted int := 0;
  v_left    int := 0;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

  for v_m in select household_id, role from household_members where user_id = v_uid
  loop
    -- 뒤를 이을 사람: **이미 관리자인 사람 우선**, 그다음 가장 오래 있은 사람.
    -- 오래 있은 사람을 고르는 이유는 그 집을 가장 잘 아는 사람일 가능성이 높아서다.
    select user_id into v_heir
    from household_members
    where household_id = v_m.household_id and user_id <> v_uid
    order by (role = 'owner') desc, joined_at asc
    limit 1;

    if v_heir is null then
      -- 나 혼자인 집 → 집과 그 아래 전부(장소·박스·물건·이력·구매목록·초대)를 지운다.
      -- 8개 자식 테이블이 전부 ON DELETE CASCADE 라 이 한 줄로 정리된다.
      delete from households where id = v_m.household_id;
      v_deleted := v_deleted + 1;
    else
      if v_m.role = 'owner' then
        -- 관리자를 넘긴다. 상속자가 이미 관리자면 이 UPDATE 는 아무것도 바꾸지 않는다
        -- (t05 는 role 이 실제로 달라질 때만 검사하므로 조용히 통과한다).
        update household_members
           set role = 'owner'
         where household_id = v_m.household_id and user_id = v_heir;
      end if;
      -- 넘긴 뒤에 나간다. 순서가 반대면 t06_last_owner_guard 가 막는다 —
      -- 그게 이 트리거의 존재 이유다.
      delete from household_members
       where household_id = v_m.household_id and user_id = v_uid;
      v_left := v_left + 1;
    end if;
  end loop;

  -- 프로필은 **지우지 않고 익명화**한다. 지우면 created_by/updated_by FK 가 걸린
  -- 행들이 23503 으로 함께 막히고, 남의 집에 남긴 변경 이력(AC20/AC21)이 사라진다.
  update profiles
     set display_name = '탈퇴한 사용자',
         avatar_url   = null
   where id = v_uid;

  -- 인증 계정을 지운다 = 다시 로그인할 수 없다.
  -- 위에서 profiles_id_fkey 를 끊었기 때문에 여기서 프로필이 함께 지워지지 않는다.
  delete from auth.users where id = v_uid;

  return jsonb_build_object('deleted_households', v_deleted, 'left_households', v_left);
end;
$$;

revoke all on function public.account_deletion_preview() from public;
revoke all on function public.delete_account()           from public;
grant execute on function public.account_deletion_preview() to authenticated;
grant execute on function public.delete_account()           to authenticated;
