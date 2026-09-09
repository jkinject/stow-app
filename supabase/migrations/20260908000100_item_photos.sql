-- 홈 스토어 — 물건 하나에 사진 여러 장 (2026-09-08 사용자 요청)
--
-- 지금까지 물건 하나에 사진은 한 장이었다(items.photo_path / thumb_path).
-- 사진 1장 = item_photos 1행으로 바꾼다. 최대 10장, sort_order 순.
--
-- ⚠⚠ items.photo_path / thumb_path 는 **남긴다 — "대표 사진"(첫 장)의 복사본이다.**
--   목록·검색·겹침 사진(covers)·휴지통·수거 큐·탈퇴·휴면 정리… items 의 이 두 컬럼을
--   읽는 곳이 열 군데가 넘는다. 전부 조인으로 바꾸면 반드시 한 군데를 빠뜨린다.
--   대신 **트리거가 맞춘다.** 클라이언트는 item_photos 만 쓰고 items 의 두 컬럼은
--   손대지 않는다 (P4 — 서버가 진실의 원천). 덤으로 대표 사진이 바뀌면 t30 이
--   items 의 photo_path 변경으로 이력을 남기고, t50 이 방송한다 — 새로 만들 것이 없다.
--
-- 경로 규약은 그대로다: {household_id}/{item_id}/{photo_id}.jpg · {photo_id}_t.jpg
-- Storage 정책은 경로의 첫 조각(가구 id)만 보므로 바꿀 것이 없다.
--
-- 박스(containers)는 여전히 한 장이다. 박스 사진은 "어떤 상자인지" 알아보는 용도라
-- 한 장이면 충분하고, 요청도 물건에 대한 것이었다.

-- ═════════════════════════════════════════════════════════════
-- 테이블
-- ═════════════════════════════════════════════════════════════
create table public.item_photos (
  -- ⚠ default 없음: 클라이언트가 만든다. 파일명(경로의 uuid)과 같은 값이라
  --   "파일은 올라갔는데 행이 없다" 를 재시도할 때 같은 id 로 다시 넣으면 된다.
  id           uuid primary key,
  -- ⚠ 클라이언트가 보낸 값은 **무시된다** — 아래 t60 이 물건의 가구로 덮어쓴다.
  household_id uuid not null references public.households(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  photo_path   text not null check (length(photo_path) > 0),   -- 1280px 원본
  thumb_path   text not null check (length(thumb_path) > 0),   -- 640px 썸네일
  -- 작을수록 앞. 대표 사진 = 가장 작은 값 (같으면 먼저 넣은 것)
  sort_order   int  not null default 0,
  created_by   uuid not null default auth.uid() references public.profiles(id),
  created_at   timestamptz not null default now()
);

comment on table public.item_photos is
  '물건 사진. 1장 = 1행, 최대 10장. items.photo_path/thumb_path 는 이 표의 첫 장을 복사한 대표 사진이고 t61 이 맞춘다.';

create index item_photos_item on public.item_photos(item_id, sort_order, created_at, id);
create index item_photos_hh   on public.item_photos(household_id);

-- ═════════════════════════════════════════════════════════════
-- t60 — 가구 id 는 물건에서 가져온다 · 물건은 못 바꾼다 · 10장 상한
-- ═════════════════════════════════════════════════════════════
create or replace function public.t60_item_photo_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_hh    uuid;
  v_count int;
begin
  if tg_op = 'UPDATE' and new.item_id is distinct from old.item_id then
    raise exception '사진을 다른 물건으로 옮길 수 없습니다.' using errcode = 'check_violation';
  end if;

  -- ⚠ RLS 때문에 남의 물건은 여기서 보이지 않는다(0행) → 아래 not found 로 튕긴다.
  --   즉 "남의 물건에 내 가구 id 를 붙여 넣기" 가 원천적으로 안 된다.
  select household_id into v_hh from items where id = new.item_id;
  if v_hh is null then
    raise exception '물건을 찾을 수 없습니다.' using errcode = 'foreign_key_violation';
  end if;
  new.household_id := v_hh;

  if tg_op = 'INSERT' then
    select count(*) into v_count from item_photos where item_id = new.item_id;
    if v_count >= 10 then
      raise exception '사진은 물건 하나에 최대 10장까지 넣을 수 있습니다.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger t60_item_photo_guard before insert or update on public.item_photos
  for each row execute function public.t60_item_photo_guard();

-- ═════════════════════════════════════════════════════════════
-- t61 — 대표 사진 동기화. 사진이 들어오고 나가고 순서가 바뀌면 items 의 두 컬럼을 맞춘다.
--
-- ⚠ 값이 실제로 달라질 때만 UPDATE 한다. 안 그러면 t10 이 updated_at 을 건드리고
--   t50 이 방송을 해서, 사진 하나 넣을 때마다 목록이 헛되이 다시 그려진다.
-- ⚠ 물건이 하드 삭제되며 CASCADE 로 사진 행이 지워질 때도 이 트리거가 돈다.
--   그때 items 행은 이미 없어서 UPDATE 는 0행 — 무해하다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t61_sync_item_cover()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_item  uuid := coalesce(new.item_id, old.item_id);
  v_photo text;
  v_thumb text;
begin
  select photo_path, thumb_path into v_photo, v_thumb
    from item_photos
   where item_id = v_item
   order by sort_order, created_at, id
   limit 1;

  update items
     set photo_path = v_photo, thumb_path = v_thumb
   where id = v_item
     and (photo_path is distinct from v_photo or thumb_path is distinct from v_thumb);
  return null;
end;
$$;

create trigger t61_sync_item_cover after insert or update or delete on public.item_photos
  for each row execute function public.t61_sync_item_cover();

-- ═════════════════════════════════════════════════════════════
-- RLS — items 와 같은 기준(가구 구성원). 사진 행은 클라이언트가 직접 지운다
-- (items 와 달리 휴지통이 없다 — 사진을 떼는 것은 이미 확인창을 거친다).
-- ═════════════════════════════════════════════════════════════
alter table public.item_photos enable row level security;

create policy ph_select on public.item_photos for select using (is_household_member(household_id));
create policy ph_insert on public.item_photos for insert with check (is_household_member(household_id));
create policy ph_update on public.item_photos for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy ph_delete on public.item_photos for delete using (is_household_member(household_id));

grant select, insert, update, delete on public.item_photos to authenticated;

-- ═════════════════════════════════════════════════════════════
-- 옮겨 넣기 — 이미 사진이 있는 물건은 그 한 장을 첫 행으로.
-- ⚠ auth.uid() 가 없는 마이그레이션 컨텍스트라 created_by 를 명시한다.
-- ⚠ t61 이 돌지만 같은 경로라 items 는 바뀌지 않는다(이력·방송 없음).
-- ═════════════════════════════════════════════════════════════
insert into public.item_photos (id, household_id, item_id, photo_path, thumb_path, sort_order, created_by, created_at)
select gen_random_uuid(), household_id, id, photo_path, thumb_path, 0, created_by, created_at
  from public.items
 where photo_path is not null and thumb_path is not null;

-- ═════════════════════════════════════════════════════════════
-- 정리 흐름 셋에 새 경로를 끼워 넣는다. 빠뜨리면 그 사진들은 **영원히 남는다** —
-- 행이 사라진 뒤에는 경로를 아는 곳이 없다(20260902000100 의 이유와 같다).
--
--   ① purge_expired_soft_deletes — 하드 삭제 전에 수거 큐로
--   ② account_deletion_preview  — 탈퇴 전에 앱이 지울 목록으로
--   ③ dormant_households_to_delete — 휴면 삭제 전에 Edge Function 이 지울 목록으로
-- ═════════════════════════════════════════════════════════════

-- ① 본문은 20260902000100 과 같고, item_photos 의 insert 하나만 추가했다.
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

  -- 여러 장 사진. items 가 지워지면 CASCADE 로 함께 사라지므로 **여기서** 남겨야 한다.
  -- (대표 사진은 위와 겹치지만 primary key 라 한 번만 들어간다)
  insert into storage_gc (path, household_id)
  select p, hh from (
    select unnest(array[ph.photo_path, ph.thumb_path]) as p, ph.household_id as hh
      from item_photos ph
      join items i on i.id = ph.item_id
     where i.deleted_at is not null and i.deleted_at < v_cutoff
  ) x
  where p is not null
  on conflict (path) do nothing;

  delete from items where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_del_i = row_count;

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

  delete from locations where deleted_at is not null and deleted_at < v_cutoff
    and not exists (select 1 from items i      where i.location_id = locations.id)
    and not exists (select 1 from containers c where c.location_id = locations.id);
  get diagnostics v_del_l = row_count;

  insert into maintenance_log (job, candidate_count, deleted_count)
  values ('purge_expired_soft_deletes', v_total, v_del_i + v_del_c + v_del_l);
end;
$$;

revoke all on function public.purge_expired_soft_deletes() from public, anon, authenticated;

-- ② 본문은 20260902000100 과 같고, union 하나만 추가했다.
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
      from item_photos where household_id = any(v_doomed)
    union
    select unnest(array[photo_path, thumb_path])
      from containers where household_id = any(v_doomed)
    union
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

-- ③ 본문은 20260902000200 과 같고, union 하나만 추가했다.
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
             select unnest(array[ph.photo_path, ph.thumb_path])
               from item_photos ph where ph.household_id = h.id
             union
             select unnest(array[c.photo_path, c.thumb_path])
               from containers c where c.household_id = h.id
             union
             select g.path from storage_gc g where g.household_id = h.id
           ) x where p is not null
         ), '{}')
    from households h
   where h.warned_at is not null
     and h.warned_at < now() - make_interval(days => setting_int('delete_after_warn_days', 30));
end;
$$;
