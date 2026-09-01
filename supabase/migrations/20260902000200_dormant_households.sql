-- ═════════════════════════════════════════════════════════════
-- 휴면 집 파기 (2026-09-02, 사용자 결정)
--
-- 왜: 앱을 깔고 사진 몇 장 올린 뒤 돌아오지 않는 사람의 데이터를 영원히 들고 있을 수
--   없다. 지금까지의 정리 장치는 셋 다 **사용자가 뭔가 해야** 돌았다 —
--   휴지통 30일(지워야 함) · storage_gc(purge 가 돌아야 함) · 탈퇴(탈퇴해야 함).
--   아무것도 안 하고 사라진 사람은 어느 것에도 걸리지 않는다.
--
-- 시간표 (마지막 접속 기준):
--     90일   아무도 안 들어옴  → 휴면으로 표시
--    120일   (휴면 30일)       → 관리자에게 삭제 예고 메일
--    150일   (예고 30일)       → 집과 그 아래 전부 삭제
--   중간에 한 번이라도 들어오면 모든 표시가 지워지고 처음부터 다시 센다.
--
-- ⚠ 삭제 단위는 **사용자가 아니라 집**이다. 한 명이 안 들어와도 다른 가족이 매일
--   쓰는 집이 있다. 사용자 단위로 지우면 남의 집 데이터를 지우게 된다.
--
-- ⚠ 여기서는 **판정만** 한다. 메일 발송과 사진 파일 삭제는 SQL 이 할 수 없어
--   Edge Function(`household-lifecycle`)이 맡는다. 그래서 "표시 → 확인" 을 두 단계로
--   나눴다: 메일이 실제로 나간 뒤에 `mark_household_warned` 를 부른다. 한 함수로
--   묶으면 메일 발송이 실패해도 예고한 것으로 기록되어, **예고 없이 지우게 된다.**
-- ═════════════════════════════════════════════════════════════

alter table public.households
  add column if not exists last_seen_at  timestamptz not null default now(),
  add column if not exists dormant_since timestamptz,
  add column if not exists warned_at     timestamptz;

comment on column public.households.last_seen_at is
  '구성원 아무나 앱을 연 마지막 시각. touch_household() 가 하루에 한 번만 올린다.';
comment on column public.households.dormant_since is
  '휴면으로 표시된 시각. 접속하면 null 로 돌아간다.';
comment on column public.households.warned_at is
  '삭제 예고 메일이 **실제로 나간** 시각. 메일 성공 뒤에만 채운다.';

-- 휴면 후보를 찾는 조회에 쓴다. 대부분의 집은 활동 중이라 부분 인덱스가 맞다.
create index if not exists households_dormant_idx
  on public.households(last_seen_at) where dormant_since is null;
create index if not exists households_warn_idx
  on public.households(dormant_since) where dormant_since is not null and warned_at is null;

-- ── 기간 설정 ────────────────────────────────────────────────
-- 코드에 숫자를 박지 않는다. 운영하며 조정할 값이고, 방침 문구와 맞아야 한다.
insert into public.app_settings (key, value) values
  ('dormant_after_days', '90'),
  ('warn_after_dormant_days', '30'),
  ('delete_after_warn_days', '30'),
  -- purge 와 같은 종류의 안전장치. 하루에 이만큼 넘게 지워질 일은 정상 운영에 없다.
  ('dormant_delete_abort_over', '50')
on conflict (key) do nothing;

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable set search_path = public as $$
  select coalesce((select value::int from app_settings where key = p_key), p_default);
$$;

-- ═════════════════════════════════════════════════════════════
-- 접속 기록 — 앱이 켜질 때 부른다
-- ═════════════════════════════════════════════════════════════
create or replace function public.touch_household(p_household uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_household_member(p_household) then
    -- 조용히 넘긴다. 남의 집 시각을 올릴 수 없다는 것만 보장하면 되고, 오류를 던지면
    -- 앱이 켜질 때마다 실패 경고가 뜬다.
    return;
  end if;
  /**
   * ⚠ 하루에 한 번만 쓴다. 앱을 열 때마다 UPDATE 하면 같은 행을 하루에도 수십 번
   *   갱신해 WAL 과 인덱스만 부풀린다. 90일을 재는 데 하루 해상도면 충분하다.
   * ⚠ 접속했으면 휴면·예고 표시를 **지운다.** 이게 없으면 돌아온 사람의 집이
   *   그대로 삭제된다 — 이 기능에서 가장 위험한 실수다.
   */
  update households
     set last_seen_at  = now(),
         dormant_since = null,
         warned_at     = null
   where id = p_household
     and (last_seen_at < now() - interval '1 day'
          or dormant_since is not null
          or warned_at is not null);
end;
$$;

revoke all on function public.touch_household(uuid) from public, anon;
grant execute on function public.touch_household(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════
-- 유지보수 함수들 — cron/Edge Function 만 부른다
--
-- ⚠ 호출자 검사가 purge_expired_soft_deletes 와 다르다. 저건 cron(신원 없음)만
--   부르지만, 이쪽은 **service_role** 로 오는 Edge Function 도 불러야 한다.
--   authenticated·anon 은 어느 쪽도 안 된다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.assert_maintenance_caller()
returns void language plpgsql stable set search_path = public as $$
declare
  v_claims text := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '');
begin
  if v_claims = '' then
    return; -- cron (postgres) — 신원 자체가 없다
  end if;
  if (v_claims::jsonb ->> 'role') = 'service_role' then
    return; -- Edge Function
  end if;
  raise exception '유지보수 작업은 직접 호출할 수 없습니다.' using errcode = 'insufficient_privilege';
end;
$$;
revoke all on function public.assert_maintenance_caller() from public, anon, authenticated;

/** 90일 안 들어온 집을 휴면으로 표시한다. 표시된 수를 돌려준다 */
create or replace function public.mark_dormant_households()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  perform assert_maintenance_caller();
  update households
     set dormant_since = now()
   where dormant_since is null
     and last_seen_at < now() - make_interval(days => setting_int('dormant_after_days', 90));
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into maintenance_log (job, candidate_count, deleted_count)
    values ('mark_dormant_households', v_n, 0);
  end if;
  return v_n;
end;
$$;

/**
 * 예고 메일을 보내야 할 집. 관리자 이메일을 함께 준다.
 * ⚠ 관리자가 여럿이면 전부에게 보낸다. 한 명만 골라 보내면 그 사람이 메일을 안 볼 때
 *   집이 통째로 사라진다.
 */
create or replace function public.dormant_households_to_warn()
returns table (household_id uuid, household_name text, emails text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_maintenance_caller();
  return query
  select h.id, h.name,
         -- ⚠ auth.users.email 은 varchar 다. 캐스팅하지 않으면 함수 반환 타입(text[])과
         --   달라 "structure of query does not match function result type" 로 죽는다.
         coalesce(array_agg(u.email::text) filter (where u.email is not null), '{}')
    from households h
    join household_members m on m.household_id = h.id and m.role = 'owner'
    join auth.users u        on u.id = m.user_id
   where h.dormant_since is not null
     and h.warned_at is null
     and h.dormant_since < now() - make_interval(days => setting_int('warn_after_dormant_days', 30))
   group by h.id, h.name;
end;
$$;

/** 메일이 **실제로 나간 뒤에만** 부른다 */
create or replace function public.mark_household_warned(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  perform assert_maintenance_caller();
  update households set warned_at = now()
   where id = any(p_ids) and dormant_since is not null and warned_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/**
 * 예고 후 30일이 지나 지울 집. **사진 경로를 함께 준다.**
 * 행을 지우면 경로를 아는 곳이 없어지므로, 지우기 전에 받아 가야 한다.
 */
create or replace function public.dormant_households_to_delete()
returns table (household_id uuid, paths text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_maintenance_caller();
  return query
  select h.id,
         coalesce((
           select array_agg(p) from (
             select unnest(array[i.photo_path, i.thumb_path]) as p
               from items i where i.household_id = h.id
             union
             select unnest(array[c.photo_path, c.thumb_path])
               from containers c where c.household_id = h.id
             union
             -- 아직 안 비운 수거 큐도 함께. 집이 사라지면 CASCADE 로 없어진다.
             select g.path from storage_gc g where g.household_id = h.id
           ) x where p is not null
         ), '{}')
    from households h
   where h.warned_at is not null
     and h.warned_at < now() - make_interval(days => setting_int('delete_after_warn_days', 30));
end;
$$;

/**
 * 실제 삭제. **사진 파일을 먼저 지운 뒤에** 부른다.
 * 반대로 하면 경로를 잃어 파일이 영영 남는다 (storage_gc 를 만든 이유와 같다).
 */
create or replace function public.delete_dormant_households(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := setting_int('dormant_delete_abort_over', 50);
  v_n     int;
  v_ask   int := coalesce(array_length(p_ids, 1), 0);
begin
  perform assert_maintenance_caller();
  if v_ask = 0 then return 0; end if;

  -- 안전장치. 한 번에 이만큼 넘게 지워야 한다면 판정 로직이 잘못됐을 가능성이 크다.
  if v_ask > v_limit then
    insert into maintenance_log (job, candidate_count, deleted_count, aborted_reason)
    values ('delete_dormant_households', v_ask, 0,
            format('대상 %s곳이 상한 %s곳을 초과하여 중단', v_ask, v_limit));
    return 0;
  end if;

  /**
   * ⚠ 조건을 여기서 **다시 확인한다.** 부르는 쪽이 준 목록을 그대로 믿으면,
   *   그 사이에 누가 접속해 휴면이 풀린 집까지 지운다. 목록을 뽑은 시점과 지우는
   *   시점 사이에는 메일 발송과 파일 삭제가 들어가 시간이 꽤 걸린다.
   */
  delete from households
   where id = any(p_ids)
     and warned_at is not null
     and warned_at < now() - make_interval(days => setting_int('delete_after_warn_days', 30));
  get diagnostics v_n = row_count;

  insert into maintenance_log (job, candidate_count, deleted_count)
  values ('delete_dormant_households', v_ask, v_n);
  return v_n;
end;
$$;

revoke all on function public.mark_dormant_households()          from public, anon, authenticated;
revoke all on function public.dormant_households_to_warn()       from public, anon, authenticated;
revoke all on function public.mark_household_warned(uuid[])      from public, anon, authenticated;
revoke all on function public.dormant_households_to_delete()     from public, anon, authenticated;
revoke all on function public.delete_dormant_households(uuid[])  from public, anon, authenticated;
revoke all on function public.setting_int(text, int)             from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════
-- storage_gc 가 집이 사라져도 살아남게 한다.
--
-- ⚠ 예전에는 household_id 에 ON DELETE CASCADE 가 걸려 있었다. 집이 지워지면 큐도
--   함께 사라져 **그 집 사진의 경로를 아는 곳이 없어진다.** 휴면 삭제는 집을 통째로
--   지우므로 이 문제가 곧바로 드러난다. FK 를 끊고 uuid 만 남긴다 —
--   RLS 는 여전히 is_household_member 로 판정하므로 살아 있는 집에는 그대로 동작하고,
--   사라진 집의 행은 Edge Function(service_role)이 치운다.
-- ═════════════════════════════════════════════════════════════
alter table public.storage_gc drop constraint if exists storage_gc_household_id_fkey;

comment on column public.storage_gc.household_id is
  '⚠ FK 가 아니다(일부러). 집이 지워져도 경로가 남아야 파일을 지울 수 있다.';
