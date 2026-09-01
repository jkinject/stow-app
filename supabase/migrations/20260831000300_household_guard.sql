-- 홈 스토어 — 가족(구성원) 관리 안전장치 (2026-08-31)
--
-- 가족 관리 UI 를 만들면서 기존 RLS 를 다시 읽다가 두 가지를 발견했다.
--
-- 1) **권한 상승 구멍.** 기존 정책은
--        hm_update using (user_id = auth.uid()) with check (user_id = auth.uid())
--    하나뿐이었다. 의도는 "본인의 알림 on/off(AC17)만 바꾼다" 였지만, 정책은 컬럼을
--    가리지 않는다. 즉 **아무 구성원이나** 다음 한 줄로 스스로 관리자가 될 수 있었다.
--        update household_members set role = 'owner' where user_id = auth.uid();
--    RLS 만으로는 못 막는다 — with check 는 OLD 를 볼 수 없어 "role 이 바뀌었는가" 를
--    표현할 방법이 없다. 그래서 트리거로 막는다.
--
-- 2) **주인 없는 가구.** hm_delete 는 `user_id = auth.uid()` 로 본인 탈퇴를 허용한다.
--    관리자가 한 명뿐인 가구에서 그 관리자가 나가면 남은 사람은 누구도 초대·추방·이름
--    변경을 할 수 없는 가구에 갇힌다. 되돌릴 경로가 없으므로 애초에 막는다.
--
-- ⚠ 둘 다 **DB 에서** 막는다. 화면에서만 막으면 언젠가 다른 화면이 생겨 새어 나간다.

-- ═════════════════════════════════════════════════════════════
-- 관리자가 남의 행을 고칠 수 있게 정책을 하나 더 둔다.
-- 정책은 OR 로 합쳐지므로 기존 hm_update(본인 행)는 그대로 살아 있다.
-- 무엇을 바꿀 수 있는지는 아래 트리거가 판정한다.
-- ═════════════════════════════════════════════════════════════
drop policy if exists hm_update_owner on public.household_members;
create policy hm_update_owner on public.household_members for update
  using (is_household_owner(household_id))
  with check (is_household_owner(household_id));

comment on policy hm_update on public.household_members is
  '본인 행. 실제로 바꿀 수 있는 것은 notify_threshold 뿐 — role 변경은 t05_member_role_guard 가 막는다';

-- ═════════════════════════════════════════════════════════════
-- t05_member_role_guard — 역할 변경 권한
-- ═════════════════════════════════════════════════════════════
create or replace function public.t05_member_role_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role is not distinct from old.role then
    return new;                                  -- 알림 설정 등 다른 칸은 그냥 통과
  end if;

  -- auth.uid() 가 없으면 서버 컨텍스트(마이그레이션·시드·service_role)다.
  -- 여기까지 막으면 복구 수단이 사라진다.
  if auth.uid() is not null and not is_household_owner(old.household_id) then
    raise exception '역할은 관리자만 바꿀 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists t05_member_role_guard on public.household_members;
create trigger t05_member_role_guard before update on public.household_members
  for each row execute function public.t05_member_role_guard();

-- ═════════════════════════════════════════════════════════════
-- t06_last_owner_guard — 마지막 관리자 보호
--   · DELETE: 마지막 관리자를 지우려 하면 거부
--   · UPDATE: 마지막 관리자를 구성원으로 강등하려 하면 거부
--
-- ⚠ 가구 자체가 지워지는 cascade 에서는 통과시켜야 한다. FK cascade 는 부모 행이
--   먼저 사라진 뒤에 돌기 때문에, households 에 행이 없으면 cascade 로 판정한다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t06_last_owner_guard()
returns trigger
language plpgsql
security definer          -- household_members 를 RLS 없이 세어야 정확하다
set search_path = public
as $$
declare
  v_leaving boolean;
  v_others  int;
begin
  v_leaving := (tg_op = 'DELETE' and old.role = 'owner')
            or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner');

  if not v_leaving then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  if not exists (select 1 from households where id = old.household_id) then
    return old;                                  -- 가구 삭제 cascade — 지킬 대상이 없다
  end if;

  select count(*) into v_others
  from household_members
  where household_id = old.household_id and role = 'owner' and user_id <> old.user_id;

  if v_others = 0 then
    raise exception '마지막 관리자는 나갈 수 없습니다. 다른 구성원을 먼저 관리자로 지정해 주세요.'
      using errcode = 'restrict_violation';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

drop trigger if exists t06_last_owner_guard on public.household_members;
create trigger t06_last_owner_guard before delete or update on public.household_members
  for each row execute function public.t06_last_owner_guard();
