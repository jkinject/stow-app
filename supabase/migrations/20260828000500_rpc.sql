-- 홈 스토어 M1 — 서버 RPC (계획 §4.2.1)
--
-- 존재 이유 두 가지:
--  (1) RLS 로 풀 수 없는 것 — 가구 생성/초대 수락은 "아직 멤버가 아닌" 상태에서
--      일어나므로 어떤 with check 도 통과할 수 없다.
--  (2) P3 — 감사 필드(used_by, resolved_by)를 클라이언트가 쓰지 못하게 한다.

-- ═════════════════════════════════════════════════════════════
-- adjust_item_quantity — 원자적 증감 (AC15, AC22)
-- 클라이언트가 계산한 절대값을 받지 않는다.
-- 두 명이 동시에 −1 하면 −2 가 되어야지 −1 이 되면 안 된다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.adjust_item_quantity(p_item_id uuid, p_delta int)
returns public.items
language plpgsql
security invoker          -- RLS 를 그대로 탄다: 남의 가구 물건은 0행이 되어 실패
set search_path = public
as $$
declare
  v_item items;
begin
  update items
     set quantity = greatest(0, quantity + p_delta)
   where id = p_item_id and deleted_at is null
  returning * into v_item;

  if v_item.id is null then
    raise exception '물건을 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  return v_item;
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- create_household — 닭과 달걀 해소 (AC25)
-- households 에 INSERT 정책을 둘 수 없는 이유: 가구를 만드는 순간엔
-- 아직 멤버가 아니라 is_household_member() 가 false 다.
-- 가구 생성 + owner 멤버십을 한 트랜잭션으로 처리한다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hh  households;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception '가구 이름을 입력해 주세요.' using errcode = 'check_violation';
  end if;

  insert into households (name, created_by) values (btrim(p_name), v_uid)
  returning * into v_hh;

  insert into household_members (household_id, user_id, role)
  values (v_hh.id, v_uid, 'owner');

  return v_hh;
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- accept_invite — 초대 수락 (AC25, P3)
-- SECURITY DEFINER 인 이유: 참여자는 아직 멤버가 아니라 iv_select 정책으로
-- 초대 코드를 조회할 수조차 없다.
-- 멤버 추가 + invite 소비를 한 트랜잭션으로. used_by 는 서버가 스탬프한다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.accept_invite(p_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv invites;
  v_hh  households;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_inv from invites where code = btrim(p_code) for update;

  if v_inv.id is null then
    raise exception '초대 코드를 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  if v_inv.used_at is not null then
    raise exception '이미 사용된 초대 코드입니다.' using errcode = 'check_violation';
  end if;
  if v_inv.expires_at < now() then
    raise exception '만료된 초대 코드입니다.' using errcode = 'check_violation';
  end if;

  insert into household_members (household_id, user_id, role)
  values (v_inv.household_id, v_uid, 'member')
  on conflict (household_id, user_id) do nothing;

  update invites set used_by = v_uid, used_at = now() where id = v_inv.id;

  select * into v_hh from households where id = v_inv.household_id;
  return v_hh;
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- resolve_shopping_item — 구매 완료 (AC19, P3)
-- 수량 갱신 + resolved_by 스탬프를 한 트랜잭션으로.
-- shopping_list 에 UPDATE 정책이 없으므로 이 경로가 유일하다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.resolve_shopping_item(p_id uuid, p_new_quantity int)
returns public.shopping_list
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row shopping_list;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from shopping_list where id = p_id for update;

  if v_row.id is null or not is_household_member(v_row.household_id) then
    raise exception '구매 항목을 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  if v_row.resolved_at is not null then
    raise exception '이미 처리된 항목입니다.' using errcode = 'check_violation';
  end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception '수량은 0 이상이어야 합니다.' using errcode = 'check_violation';
  end if;

  -- 수량을 올리면 t40 이 임계치 복귀를 감지해 자동항목을 해제할 수도 있다.
  update items set quantity = p_new_quantity where id = v_row.item_id;

  update shopping_list
     set resolved_at = coalesce(resolved_at, now()), resolved_by = coalesce(resolved_by, v_uid)
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- sign_item_photos — 배치 서명 URL (AC7, R13)
-- 목록 스크롤마다 개별 요청하지 않도록 최대 50개를 한 번에 발급한다.
-- ⚠ Storage 서명은 SQL 이 아니라 Storage API 의 일이므로, 이 함수는
--   "요청한 경로들이 내 가구 것인지" 검증만 하고 통과한 경로를 돌려준다.
--   클라이언트는 이 결과만 createSignedUrls() 에 넘긴다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.sign_item_photos(p_paths text[])
returns setof text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_path text;
begin
  if p_paths is null or array_length(p_paths, 1) is null then
    return;
  end if;
  if array_length(p_paths, 1) > 50 then
    raise exception '한 번에 최대 50개까지만 요청할 수 있습니다.' using errcode = 'check_violation';
  end if;

  foreach v_path in array p_paths loop
    -- 경로 규약: {household_id}/{item_id}/{uuid}.jpg
    if is_household_member((split_part(v_path, '/', 1))::uuid) then
      return next v_path;
    end if;
  end loop;
end;
$$;

revoke all on function public.adjust_item_quantity(uuid, int)  from public;
revoke all on function public.create_household(text)           from public;
revoke all on function public.accept_invite(text)              from public;
revoke all on function public.resolve_shopping_item(uuid, int) from public;
revoke all on function public.sign_item_photos(text[])         from public;

grant execute on function public.adjust_item_quantity(uuid, int)  to authenticated;
grant execute on function public.create_household(text)           to authenticated;
grant execute on function public.accept_invite(text)              to authenticated;
grant execute on function public.resolve_shopping_item(uuid, int) to authenticated;
grant execute on function public.sign_item_photos(text[])         to authenticated;
