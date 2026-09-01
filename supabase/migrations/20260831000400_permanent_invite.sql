-- 홈 스토어 — 초대 코드를 가구당 하나, 영구로 (2026-08-31)
--
-- 전에는 초대가 **일회용 티켓**이었다. 발급할 때마다 행이 하나 생기고, 7일 뒤 만료되고,
-- 한 사람이 쓰면 소비됐다. 그래서 화면에는 유효한 코드가 여러 장 쌓였고, 각각의
-- 남은 기간과 취소를 따로 관리해야 했다. 가족 서너 명이 쓰는 앱에 그만한 장치가
-- 필요하지 않다 (사용자 판단, 2026-08-31).
--
-- 이제는 **집에 코드가 하나 붙어 있다.** 만료도 소비도 없다.
--
-- ⚠ 대신 잃는 것이 하나 있다. 영구 코드는 스스로 무효가 되지 않으므로, 한 번 내보낸
--   사람이 코드를 기억하고 있으면 그대로 다시 들어올 수 있다. 그래서 **코드 바꾸기**가
--   회수 수단이 된다 — iv_update 정책이 그 기능의 전부다. 이게 없으면 영구 코드는
--   되돌릴 수 없는 열쇠가 된다.

-- ═════════════════════════════════════════════════════════════
-- 1) 가구당 하나로 접는다 — 가장 최근 것만 남긴다
--    ⚠ 이미 남에게 보낸 옛 코드는 여기서 죽는다. 하나로 접는 이상 피할 수 없다.
-- ═════════════════════════════════════════════════════════════
delete from public.invites a
using public.invites b
where a.household_id = b.household_id
  and (a.created_at, a.id) < (b.created_at, b.id);

-- ═════════════════════════════════════════════════════════════
-- 2) 만료·소비 개념 삭제
-- ═════════════════════════════════════════════════════════════
alter table public.invites drop column if exists expires_at;
alter table public.invites drop column if exists used_by;
alter table public.invites drop column if exists used_at;

alter table public.invites drop constraint if exists invites_household_uniq;
alter table public.invites add constraint invites_household_uniq unique (household_id);

comment on table public.invites is
  '가구당 한 행. 만료도 소비도 없다 — 회수는 code 를 바꾸는 것(iv_update)으로 한다';

-- ═════════════════════════════════════════════════════════════
-- 3) 코드 생성기 — 서버가 만든다
--    클라이언트가 만들어 보내면 충돌 시 23505 를 사용자에게 그대로 보여주게 된다.
--    혼동하기 쉬운 글자(0/O, 1/I/L)는 뺀다 — 코드는 눈으로 읽혀 손으로 옮겨진다.
--
--    ⚠ SECURITY DEFINER 가 아니면 조용히 깨진다. 중복 검사(`select 1 from invites`)가
--      호출자의 RLS 를 타면 **자기 가구의 코드만** 보이므로, 남의 가구에 이미 있는
--      코드를 "비어 있다" 고 판정하고 돌려준다. 그 다음 unique 제약이 23505 로 터진다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.gen_invite_code()
returns text
language plpgsql
volatile
security definer          -- ⚠ 반드시 DEFINER
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v text;
begin
  for attempt in 1..20 loop
    v := '';
    for i in 1..8 loop
      v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from invites where code = v) then
      return v;
    end if;
  end loop;
  raise exception '초대 코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.';
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- 4) 코드 없는 가구 채우기 — 이 마이그레이션 전에 만들어진 집들
-- ═════════════════════════════════════════════════════════════
insert into public.invites (household_id, code, created_by)
select h.id, gen_invite_code(), h.created_by
from public.households h
where not exists (select 1 from public.invites i where i.household_id = h.id);

-- ═════════════════════════════════════════════════════════════
-- 5) 집을 만들면 코드도 함께 생긴다
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

  -- 초대 코드도 여기서 만든다. 나중에 따로 발급하게 두면 "코드가 없는 집" 이라는
  -- 상태가 생기고, 그 상태를 화면마다 다시 다뤄야 한다.
  insert into invites (household_id, code, created_by)
  values (v_hh.id, gen_invite_code(), v_uid);

  return v_hh;
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- 6) accept_invite — 만료·소비 검사 제거
--    여러 사람이 같은 코드로 들어온다. 이미 구성원이면 조용히 그 집을 돌려준다
--    (두 번 눌렀다고 오류를 보여줄 이유가 없다).
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

  select * into v_inv from invites where code = upper(btrim(p_code));

  if v_inv.id is null then
    raise exception '초대 코드를 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;

  insert into household_members (household_id, user_id, role)
  values (v_inv.household_id, v_uid, 'member')
  on conflict (household_id, user_id) do nothing;

  select * into v_hh from households where id = v_inv.household_id;
  return v_hh;
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- 7) 정책 — 코드 바꾸기(회수)를 연다
-- ═════════════════════════════════════════════════════════════
-- 보기는 구성원 전부. 우리 집 코드는 우리 집 사람이면 누구나 가족에게 보낼 수 있다.
-- 바꾸기는 관리자만 — 바꾸는 순간 남이 가진 코드가 전부 죽기 때문이다.
drop policy if exists iv_update on public.invites;
create policy iv_update on public.invites for update
  using (is_household_owner(household_id))
  with check (is_household_owner(household_id));

-- 지우기는 없앤다. 코드가 없는 집은 만들 수 없어야 한다 — 회수는 '바꾸기' 로 한다.
drop policy if exists iv_delete on public.invites;

comment on table public.invites is
  '가구당 한 행. 만료도 소비도 없다. 회수 = code 갱신(iv_update, 관리자만). DELETE 정책 없음';


-- ═════════════════════════════════════════════════════════════
-- 8) rotate_invite — 코드 바꾸기(회수)
--    security invoker 로 두고 권한은 아래에서 명시적으로 본다. DEFINER 로 만들면
--    누가 부르든 통과해 버리고, 그때 정책은 아무 말도 해주지 않는다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.rotate_invite(p_household_id uuid)
returns public.invites
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv invites;
begin
  if not is_household_owner(p_household_id) then
    raise exception '관리자만 초대 코드를 바꿀 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;

  update invites set code = gen_invite_code()
  where household_id = p_household_id
  returning * into v_inv;

  -- 코드가 아직 없는 집(이 방식 이전에 만들어졌고 백필도 놓친 경우)이면 만들어 준다.
  -- "코드 없음" 이라는 막다른 상태를 남기지 않는다.
  if v_inv.id is null then
    insert into invites (household_id, code) values (p_household_id, gen_invite_code())
    returning * into v_inv;
  end if;

  return v_inv;
end;
$$;

revoke all on function public.gen_invite_code()      from public;
revoke all on function public.rotate_invite(uuid)    from public;
grant execute on function public.rotate_invite(uuid) to authenticated;
