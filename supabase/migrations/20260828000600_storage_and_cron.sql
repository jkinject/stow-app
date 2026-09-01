-- 홈 스토어 M1 — Storage 정책 + pg_cron 정리 작업

-- ═════════════════════════════════════════════════════════════
-- Storage — 비공개 버킷 (AC28)
-- 경로 규약: {household_id}/{item_id}/{uuid}.jpg      (1280px 원본)
--            {household_id}/{item_id}/{uuid}_t.jpg    (320px 썸네일, §4.9)
-- 권한은 테이블과 **같은** is_household_member() 함수로 검증한다.
-- 인가 경로가 하나라는 것이 사진을 Supabase Storage 에 두는 핵심 이유다 (P2).
-- ═════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy photos_select on storage.objects for select
  using (bucket_id = 'item-photos'
         and public.is_household_member(((storage.foldername(name))[1])::uuid));

create policy photos_insert on storage.objects for insert
  with check (bucket_id = 'item-photos'
              and public.is_household_member(((storage.foldername(name))[1])::uuid));

create policy photos_update on storage.objects for update
  using (bucket_id = 'item-photos'
         and public.is_household_member(((storage.foldername(name))[1])::uuid));

create policy photos_delete on storage.objects for delete
  using (bucket_id = 'item-photos'
         and public.is_household_member(((storage.foldername(name))[1])::uuid));

-- ═════════════════════════════════════════════════════════════
-- 휴지통 정리 (AC24) — 30일 경과분 하드삭제
--
-- ⚠ pg_cron 작업은 postgres 역할로 실행되어 **RLS 를 완전히 우회한다.**
--   WHERE 절 버그 하나가 전 가구의 데이터를 지운다. 안전장치 셋을 건다 (Architect S4):
--   1. 대상 건수가 상한(기본 100)을 넘으면 실행을 중단하고 사유를 기록
--   2. 매 실행의 대상/삭제 건수를 maintenance_log 에 남김
--   3. `deleted_at is not null` 을 명시 — is not null 누락이 곧 전체 삭제다
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

  -- items 먼저 (containers/locations 를 참조하므로)
  delete from items where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_del_i = row_count;

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

comment on function public.purge_expired_soft_deletes is
  '⚠ postgres 역할로 실행되어 RLS 를 우회한다. WHERE 절을 고칠 때 반드시 deleted_at IS NOT NULL 을 유지할 것.';

-- 매일 04:10 KST(=19:10 UTC 전일) 실행. 로컬 개발에서는 스케줄 등록이 실패해도 무시한다.
do $$
begin
  perform cron.schedule('purge-expired-soft-deletes', '10 19 * * *',
                        $c$select public.purge_expired_soft_deletes();$c$);
exception when others then
  raise notice 'pg_cron 스케줄 등록 건너뜀: %', sqlerrm;
end;
$$;
