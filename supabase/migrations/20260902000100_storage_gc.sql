-- ═════════════════════════════════════════════════════════════
-- 사진 파일 수거 큐 (2026-09-02)
--
-- ⚠⚠ 왜 필요한가. 휴지통 30일이 지나면 `purge_expired_soft_deletes` 가 items·containers
--   행을 하드 삭제하는데, 그 행이 가리키던 **사진 파일은 스토리지에 그대로 남았다.**
--   SQL 은 Storage API 를 부를 수 없고, `storage.objects` 행을 지워도 실제 파일은
--   지워지지 않는다(features/household/deleteAccount.ts 주석에 같은 사실이 적혀 있다).
--
--   행이 사라지면 경로를 아는 곳이 **어디에도 없어진다.** 그래서 지울 실마리 자체가
--   사라지고, 되돌릴 방법이 없다. 물건 하나당 약 145KB(원본+썸네일)라 무료 티어
--   1GB 기준 삭제 물건 7,000개면 가득 찬다.
--
--   해결: 행을 지우기 **전에** 경로를 여기 남긴다. 그러면 나중에라도 지울 수 있다.
--   실제 삭제는 Storage API 를 부를 수 있는 **앱**이 한다 (features/storage/gc.ts).
--
-- ⚠ 큐에 넣는 것은 cron(SECURITY DEFINER)뿐이다. 그래서 insert 정책이 없다 —
--   클라이언트가 임의 경로를 넣어 남의 파일을 지우게 만들 수 없다.
-- ═════════════════════════════════════════════════════════════

create table if not exists public.storage_gc (
  /** `{household_id}/{owner_id}/{uuid}.jpg` — 버킷 안의 경로 */
  path         text primary key,
  /**
   * 누가 지울 수 있는지를 정하는 값.
   * ⚠ 가구가 사라지면 큐도 함께 사라진다. 그 경우 사진은 탈퇴 흐름이 이미 지운 뒤다
   *   (deleteAccount 가 delete_account 를 부르기 **전에** Storage 에서 먼저 치운다).
   */
  household_id uuid not null references public.households(id) on delete cascade,
  queued_at    timestamptz not null default now()
);

create index if not exists storage_gc_household_idx
  on public.storage_gc(household_id, queued_at);

alter table public.storage_gc enable row level security;

-- 자기 가구 큐만 보고 지운다.
-- ⚠ insert·update 정책은 **일부러 없다.** 넣는 건 cron 뿐이다.
create policy gc_select on public.storage_gc for select
  using (public.is_household_member(household_id));
create policy gc_delete on public.storage_gc for delete
  using (public.is_household_member(household_id));

comment on table public.storage_gc is
  '하드 삭제된 물건·박스의 사진 경로. 앱이 Storage 에서 실제로 지운 뒤 이 행을 지운다.';

-- ═════════════════════════════════════════════════════════════
-- purge 가 지우기 **전에** 경로를 큐에 넣도록 고친다.
-- 본문은 20260828000600 의 것과 같고, insert 두 개만 추가했다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.purge_expired_soft_deletes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit  int;
  v_cutoff timestamptz := now() - interval '30 days';
  v_items  int;
  v_cons   int;
  v_locs   int;
  v_total  int;
  v_del_i  int := 0;
  v_del_c  int := 0;
  v_del_l  int := 0;
begin
  -- ⚠ 신원 검사. 이 함수는 cron(postgres)만 부른다 — 20260901000100 참고.
  if auth.uid() is not null
     or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') <> '' then
    raise exception '유지보수 작업은 직접 호출할 수 없습니다.' using errcode = 'insufficient_privilege';
  end if;

  select value::int into v_limit from app_settings where key = 'cron_delete_batch_abort_over';

  select count(*) into v_items from items      where deleted_at is not null and deleted_at < v_cutoff;
  select count(*) into v_cons  from containers where deleted_at is not null and deleted_at < v_cutoff;
  select count(*) into v_locs  from locations  where deleted_at is not null and deleted_at < v_cutoff;
  v_total := v_items + v_cons + v_locs;

  if v_total = 0 then
    insert into maintenance_log (job, candidate_count, deleted_count)
    values ('purge_expired_soft_deletes', 0, 0);
    return;
  end if;

  -- 안전장치: 정상 운영에서 하루 100건 이상이 만료되는 일은 없다.
  if v_total > v_limit then
    insert into maintenance_log (job, candidate_count, deleted_count, aborted_reason)
    values ('purge_expired_soft_deletes', v_total, 0,
            format('대상 %s건이 상한 %s건을 초과하여 중단', v_total, v_limit));
    return;
  end if;

  -- ⚠⚠ **지우기 전에** 사진 경로를 큐에 넣는다. 순서가 반대면 경로를 잃는다.
  insert into storage_gc (path, household_id)
  select p, hh from (
    select unnest(array[photo_path, thumb_path]) as p, household_id as hh
      from items where deleted_at is not null and deleted_at < v_cutoff
  ) x
  where p is not null
  on conflict (path) do nothing;

  -- items 먼저 (containers/locations 를 참조하므로)
  delete from items where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_del_i = row_count;

  -- ⚠ 조건이 아래 delete 와 **한 글자도 다르면 안 된다.** 다르면 지워지는 것과 큐에
  --   들어가는 것이 어긋나 파일이 남거나, 살아 있는 박스의 사진이 지워진다.
  insert into storage_gc (path, household_id)
  select p, hh from (
    select unnest(array[photo_path, thumb_path]) as p, household_id as hh
      from containers where deleted_at is not null and deleted_at < v_cutoff
        and not exists (select 1 from items i where i.container_id = containers.id)
  ) x
  where p is not null
  on conflict (path) do nothing;

  delete from containers where deleted_at is not null and deleted_at < v_cutoff
    and not exists (select 1 from items i where i.container_id = containers.id);
  get diagnostics v_del_c = row_count;

  -- 장소에는 사진 컬럼이 없다 — 큐에 넣을 것이 없다.
  delete from locations where deleted_at is not null and deleted_at < v_cutoff
    and not exists (select 1 from items i      where i.location_id = locations.id)
    and not exists (select 1 from containers c where c.location_id = locations.id);
  get diagnostics v_del_l = row_count;

  insert into maintenance_log (job, candidate_count, deleted_count)
  values ('purge_expired_soft_deletes', v_total, v_del_i + v_del_c + v_del_l);
end;
$$;

-- 20260901000100 에서 잠근 권한을 다시 확인한다. create or replace 는 권한을 되돌리지
-- 않지만, 이 파일만 보고 따라 하는 사람이 있을 수 있어 명시해 둔다.
revoke all on function public.purge_expired_soft_deletes() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════
-- 탈퇴 미리보기에 **아직 안 비운 큐**도 포함한다.
-- 안 그러면 가구가 지워질 때 큐가 CASCADE 로 사라져 그 파일들이 영영 남는다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.account_deletion_preview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_doomed uuid[];
  v_paths  text[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

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
    union
    -- ⚠ 아직 앱이 비우지 못한 수거 큐. 빠뜨리면 가구가 사라지며 큐도 CASCADE 로
    --   지워져 그 파일들의 경로를 아는 곳이 없어진다.
    select path from storage_gc where household_id = any(v_doomed)
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

revoke all on function public.account_deletion_preview() from public;
grant execute on function public.account_deletion_preview() to authenticated;
