-- 홈 스토어 — 음식 탭의 레시피 추천 저장 (2026-09-29 사용자 요청)
--
-- 왜 서버에 저장하나: "레시피는 참고용이지만 **바뀌면 안 된다**" (사용자 결정 Q4).
-- 탭을 다시 열어도, 앱을 껐다 켜도, 가족 폰에서 봐도 같은 레시피여야 하고, 바뀌는 건
-- 사용자가 "다른 레시피 추천" 을 눌렀을 때뿐이다. 그러려면 결과가 기기 밖에 있어야 한다.
--
-- 세 표:
--   food_recipe_sets     — 추천 결과 원문 + 그때의 재료. 한 번 만들어지면 안 바뀐다.
--   food_recipe_current  — 가구당 "지금 보이는 세트" 포인터 하나. 재추천은 이 포인터만 옮긴다.
--   food_recipe_usage    — 가구당 하루 호출 수. 외부 API 를 부르기 **전에** 올린다.
--
-- ⚠ 클라이언트는 **읽기만** 한다. 쓰기는 전부 Edge Function(service_role)이 아래 RPC 로 한다.
--   모델 키·호출 상한·캐시 키를 클라이언트가 정하게 두면 그 자리가 곧 구멍이다.
--
-- ⚠ 설계 시안(docs/design/food-tab)에 있던 요청 영수증 표·lease·uncertain 상태·202 합류·
--   전역 잠금은 **넣지 않았다.** 이 규모(가구 몇 개, 무료 티어)에선 비용이 이익보다 크다.
--   멱등성은 (household_id, request_id) 유니크 하나로, 가족 동시 요청은 current 의
--   revision 비교(CAS)로 막는다. 필요해지면 그때 더한다.

-- ═════════════════════════════════════════════════════════════
-- 표
-- ═════════════════════════════════════════════════════════════
create table public.food_recipe_sets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  /** 재료 집합·언어·힌트·규격·모델의 해시. 같은 조합의 재요청은 이걸로 재사용한다 */
  cache_key     text not null,
  /** 같은 cache_key 에서 "다른 레시피 추천" 을 누른 횟수. 0 이 첫 결과 */
  generation    integer not null default 0 check (generation >= 0),
  locale        text not null check (locale in ('ko', 'en')),
  model         text not null,
  spec_version  text not null,
  hint          text not null default '',
  /** [{ref, name, quantity, unit, expires_on}] — 모델에 보낸 그대로. 결과를 읽을 때 ref 를 이름으로 푼다 */
  inventory     jsonb not null,
  result        jsonb not null,
  /** 버튼 한 번 = request_id 하나. 재전송·연타는 같은 id 라 여기서 튕긴다 */
  request_id    uuid not null,
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  unique (household_id, cache_key, generation),
  unique (household_id, request_id),
  -- 무료 DB 용량 보호. 레시피 3개는 넉넉히 4KB 안쪽이다
  check (octet_length(result::text) <= 32768)
);
create index food_recipe_sets_household_created on public.food_recipe_sets (household_id, created_at desc);

create table public.food_recipe_current (
  household_id  uuid primary key references public.households(id) on delete cascade,
  -- ⚠ restrict: 현재 포인터가 가리키는 세트는 지울 수 없다. 청소 로직이 생기면 여기서 걸린다
  set_id        uuid not null references public.food_recipe_sets(id) on delete restrict,
  revision      bigint not null default 1,
  updated_at    timestamptz not null default now()
);

create table public.food_recipe_usage (
  household_id  uuid not null references public.households(id) on delete cascade,
  day           date not null,           -- UTC
  attempts      integer not null default 0 check (attempts >= 0),
  primary key (household_id, day)
);

comment on table public.food_recipe_sets is
  '음식 탭 레시피 추천 결과. 불변 — 재추천은 새 행을 만들고 food_recipe_current 만 옮긴다.';
comment on table public.food_recipe_current is
  '가구당 지금 보이는 레시피 세트. revision 은 가족 동시 요청의 CAS 용.';
comment on table public.food_recipe_usage is
  '가구당 하루 Gemini 호출 수. 호출 전에 올린다 — 실패해도 한 번으로 센다.';

-- ═════════════════════════════════════════════════════════════
-- RLS — 구성원은 읽기만. 쓰기 정책은 **없다**(service_role 은 RLS 를 지나친다)
-- ═════════════════════════════════════════════════════════════
alter table public.food_recipe_sets    enable row level security;
alter table public.food_recipe_current enable row level security;
alter table public.food_recipe_usage   enable row level security;

create policy food_sets_select on public.food_recipe_sets for select
  using (public.is_household_member(household_id));
create policy food_current_select on public.food_recipe_current for select
  using (public.is_household_member(household_id));
-- 남은 횟수를 보여 주려고 읽게 둔다. 올리는 건 RPC 뿐이다
create policy food_usage_select on public.food_recipe_usage for select
  using (public.is_household_member(household_id));

revoke all on public.food_recipe_sets, public.food_recipe_current, public.food_recipe_usage
  from anon, authenticated;
grant select on public.food_recipe_sets, public.food_recipe_current, public.food_recipe_usage
  to authenticated;

-- ═════════════════════════════════════════════════════════════
-- RPC ① 호출 예약 — 하루 상한을 **원자적으로** 검사하고 올린다
--
-- ⚠ 외부 API 를 부르기 전에 부른다. 순서를 뒤집으면(부르고 나서 세면) 동시에 누른 가족
--   둘이 둘 다 통과한다. 여기서 행을 잠근 채 검사·증가하므로 하나만 통과한다.
-- ⚠ 실패한 호출도 한 번으로 남는다. 외부 API 는 보낸 순간 비용이 든다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.food_recipe_reserve(p_household uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  insert into food_recipe_usage (household_id, day, attempts)
    values (p_household, (now() at time zone 'utc')::date, 0)
    on conflict (household_id, day) do nothing;

  select attempts into v_attempts
    from food_recipe_usage
   where household_id = p_household and day = (now() at time zone 'utc')::date
   for update;

  if v_attempts >= p_limit then
    raise exception 'DAILY_LIMIT' using errcode = 'check_violation';
  end if;

  update food_recipe_usage
     set attempts = attempts + 1
   where household_id = p_household and day = (now() at time zone 'utc')::date;

  return p_limit - v_attempts - 1;   -- 이번 호출 뒤 남은 횟수
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- RPC ② 결과 저장 + 현재 포인터 교체 — 한 트랜잭션
--
-- ⚠ `p_expected_revision` 이 지금 revision 과 다르면 저장하지 않고 REVISION_MISMATCH.
--   가족 둘이 동시에 "다른 레시피" 를 눌렀을 때 늦게 끝난 쪽이 먼저 끝난 결과를 덮지 않는다.
--   현재 포인터가 아직 없으면 expected 는 0 이어야 한다.
-- ⚠ 같은 request_id 가 다시 오면(재전송) 새로 넣지 않고 이미 저장된 세트를 돌려준다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.food_recipe_store(
  p_household         uuid,
  p_request_id        uuid,
  p_created_by        uuid,
  p_cache_key         text,
  p_generation        integer,
  p_locale            text,
  p_model             text,
  p_spec_version      text,
  p_hint              text,
  p_inventory         jsonb,
  p_result            jsonb,
  p_expected_revision bigint
)
returns table (set_id uuid, revision bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set      uuid;
  v_revision bigint;
begin
  -- 재전송: 이미 저장돼 있으면 그걸 돌려준다 (current 는 그때 이미 옮겨졌다)
  select s.id into v_set from food_recipe_sets s
   where s.household_id = p_household and s.request_id = p_request_id;
  if v_set is not null then
    select c.revision into v_revision from food_recipe_current c where c.household_id = p_household;
    return query select v_set, coalesce(v_revision, 0::bigint);
    return;
  end if;

  -- 현재 포인터를 잠그고 revision 을 대조한다
  select c.revision into v_revision
    from food_recipe_current c
   where c.household_id = p_household
     for update;
  if coalesce(v_revision, 0) <> p_expected_revision then
    raise exception 'REVISION_MISMATCH' using errcode = 'serialization_failure';
  end if;

  insert into food_recipe_sets (
    household_id, request_id, created_by, cache_key, generation,
    locale, model, spec_version, hint, inventory, result
  ) values (
    p_household, p_request_id, p_created_by, p_cache_key, p_generation,
    p_locale, p_model, p_spec_version, p_hint, p_inventory, p_result
  )
  returning id into v_set;

  insert into food_recipe_current (household_id, set_id, revision, updated_at)
    values (p_household, v_set, 1, now())
    on conflict (household_id) do update
      set set_id = excluded.set_id,
          revision = food_recipe_current.revision + 1,
          updated_at = now()
    returning food_recipe_current.revision into v_revision;

  return query select v_set, v_revision;
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- RPC ③ 현재 포인터만 옮기기 — 캐시에 이미 있는 세트를 다시 현재로 (호출 없음)
-- ═════════════════════════════════════════════════════════════
create or replace function public.food_recipe_point(
  p_household         uuid,
  p_set_id            uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
begin
  if not exists (select 1 from food_recipe_sets s where s.id = p_set_id and s.household_id = p_household) then
    raise exception 'SET_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  select c.revision into v_revision
    from food_recipe_current c
   where c.household_id = p_household
     for update;
  if coalesce(v_revision, 0) <> p_expected_revision then
    raise exception 'REVISION_MISMATCH' using errcode = 'serialization_failure';
  end if;

  insert into food_recipe_current (household_id, set_id, revision, updated_at)
    values (p_household, p_set_id, 1, now())
    on conflict (household_id) do update
      set set_id = excluded.set_id,
          revision = food_recipe_current.revision + 1,
          updated_at = now()
    returning food_recipe_current.revision into v_revision;
  return v_revision;
end;
$$;

-- ⚠ 세 RPC 는 **service_role 만** 부른다. authenticated 에게 열면 상한도 CAS 도 우회된다.
revoke all on function public.food_recipe_reserve(uuid, integer)                          from public, anon, authenticated;
revoke all on function public.food_recipe_store(uuid, uuid, uuid, text, integer, text, text, text, text, jsonb, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.food_recipe_point(uuid, uuid, bigint)                       from public, anon, authenticated;
grant execute on function public.food_recipe_reserve(uuid, integer)                       to service_role;
grant execute on function public.food_recipe_store(uuid, uuid, uuid, text, integer, text, text, text, text, jsonb, jsonb, bigint) to service_role;
grant execute on function public.food_recipe_point(uuid, uuid, bigint)                    to service_role;

comment on function public.food_recipe_reserve(uuid, integer) is
  '레시피 호출 예약 — 하루 상한을 원자적으로 검사·증가. Edge Function(service_role) 전용.';
comment on function public.food_recipe_store(uuid, uuid, uuid, text, integer, text, text, text, text, jsonb, jsonb, bigint) is
  '레시피 세트 저장 + 현재 포인터 교체(revision CAS). Edge Function 전용.';
comment on function public.food_recipe_point(uuid, uuid, bigint) is
  '캐시된 세트를 현재로 가리키기(호출 없음). Edge Function 전용.';
