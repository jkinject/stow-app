-- 홈 스토어 — 공간(가구) 삭제 (2026-09-12)
--
-- 왜 생겼나: 공간을 만든 사람은 그 공간의 **유일한 관리자**다. 마지막 관리자는 나갈 수
-- 없게 막아 두었으니(t06_last_owner_guard — 관리자 없는 집을 만들지 않으려고) 실수로
-- 만든 공간, 이사 뒤 필요 없어진 공간을 **없앨 길이 하나도 없었다.** 계정 탈퇴만이
-- 혼자 쓰던 집을 지우는 유일한 경로였다.
--
-- 규칙:
--   · 관리자만 지울 수 있다. 구성원이 여럿 남아 있어도 관리자가 지우면 전부 사라진다 —
--     그래서 클라이언트는 구성원 수·물건 수를 세어 보여 주고 나서 부른다(미리보기).
--   · 행은 CASCADE 로 한 트랜잭션에 사라진다. **사진 파일은 여기서 못 지운다** —
--     Storage 객체는 SQL 로 지울 수 없고(storage.objects 행을 지워도 파일은 남는다),
--     가구가 사라진 뒤에는 Storage 정책(경로의 가구 id)에 걸려 아무도 못 지운다.
--     그래서 계정 탈퇴와 같은 순서다: 미리보기로 경로를 받아 **클라이언트가 먼저** 지우고,
--     그다음 이 함수를 부른다. (storage_gc 큐는 FK CASCADE 로 함께 사라지므로 쓸 수 없다.)
--
-- ⚠ 판정은 서버가 한다. 화면의 "관리자만 보이는 버튼" 은 편의일 뿐이다.

create or replace function public.household_deletion_preview(p_household uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_items int;
  v_members int;
  v_paths text[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from household_members
     where household_id = p_household and user_id = v_uid and role = 'owner'
  ) then
    raise exception '관리자만 공간을 지울 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_items from items where household_id = p_household and deleted_at is null;
  select count(*) into v_members from household_members where household_id = p_household;

  -- 물건 사진은 item_photos(여러 장)가 원본이고 items.photo_path 는 그 첫 장의 복사본이다 —
  -- item_photos 만 보면 된다. 휴지통의 물건 사진도 파일은 남아 있으니 함께 센다.
  -- storage_gc 큐에 아직 안 지워진 옛 파일도 같이 준다 — 가구가 사라지면 큐를 비울 사람이 없다.
  select coalesce(array_agg(p), '{}') into v_paths
    from (
      select unnest(array[photo_path, thumb_path]) as p
        from item_photos where household_id = p_household
      union
      select unnest(array[photo_path, thumb_path])
        from containers where household_id = p_household
      union
      select path from storage_gc where household_id = p_household
    ) s
   where p is not null and length(p) > 0;

  return jsonb_build_object(
    'item_count',   v_items,
    'member_count', v_members,
    'photo_paths',  to_jsonb(v_paths)
  );
end;
$$;

create or replace function public.delete_household(p_household uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from household_members
     where household_id = p_household and user_id = v_uid and role = 'owner'
  ) then
    raise exception '관리자만 공간을 지울 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;

  -- GC 큐는 명시적으로 비운다. 파일은 미리보기 경로로 클라이언트가 이미 지웠고,
  -- 가구가 사라진 뒤에는 어차피 아무도 이 큐를 처리하지 못한다(drain 은 구성원만 돈다).
  -- ⚠ storage_gc 의 households FK 는 20260902000200 에서 떼어냈다(휴면 삭제가 큐를 남기려고) — CASCADE 가 없다.
  delete from storage_gc where household_id = p_household;

  -- households 에 delete 정책이 없어 클라이언트는 못 지운다 — definer 인 여기서만.
  -- 구성원·장소·박스·물건·사진행·초대가 FK CASCADE 로 함께 사라진다.
  delete from households where id = p_household;
end;
$$;

revoke all on function public.household_deletion_preview(uuid) from public, anon;
revoke all on function public.delete_household(uuid)            from public, anon;
grant execute on function public.household_deletion_preview(uuid) to authenticated;
grant execute on function public.delete_household(uuid)            to authenticated;

comment on function public.delete_household(uuid) is
  '공간 삭제 — 관리자만. 사진 파일은 클라이언트가 household_deletion_preview 의 경로로 먼저 지운다.';
