-- 유지보수 함수를 클라이언트가 부를 수 없게 잠근다.
--
-- ⚠ 발견 경위(2026-09-01 보안 점검): `purge_expired_soft_deletes()` 는
--   · SECURITY DEFINER 이고
--   · 본문에 **호출자가 누구인지 보는 코드가 한 줄도 없고**(배치 상한만 본다)
--   · `anon` 에게 EXECUTE 가 직접 부여돼 있었다.
--
--   anon 키는 APK 안에 그대로 들어 있다. 즉 **로그인조차 안 한 사람이**
--   전 가구의 items/containers/locations 에 대한 하드 DELETE 를 아무 때나
--   돌릴 수 있었다. 지우는 대상이 이미 30일 복구 기한을 넘긴 행이라 데이터
--   손실 자체는 제한적이지만, 남의 집 휴지통을 대신 비우는 것은 명백히 월권이고
--   반복 호출로 DB 를 갈아 넣는 공격 통로이기도 하다.
--
-- 막는 방법을 두 겹으로 둔다. 한 겹은 언젠가 실수로 풀린다.
--   (1) EXECUTE 회수 — 애초에 부를 수 없게
--   (2) 본문 안의 신원 검사 — 어쩌다 권한이 다시 새어도 거절하게

-- ── (1) 권한 회수 ────────────────────────────────────────────────
-- ⚠ `from public` 만으로는 부족하다. Supabase 는 `anon`/`authenticated` 에게
--   **직접** 부여하므로(ALTER DEFAULT PRIVILEGES) PUBLIC 을 회수해도 남는다.
--   실측: proacl 이 `=X/postgres | anon=X/postgres | authenticated=X/postgres`.
revoke all on function public.purge_expired_soft_deletes() from public, anon, authenticated;

-- 초대 코드 생성기는 내부 부품이다. 다만 `rotate_invite` 가 SECURITY INVOKER 라
-- **authenticated 의 EXECUTE 는 남겨야 한다** — 회수하면 코드 바꾸기가 죽는다.
revoke all on function public.gen_invite_code() from anon;

-- 트리거 함수는 트리거로만 불린다. 직접 호출할 이유가 없다.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ── (2) 본문 신원 검사 ───────────────────────────────────────────
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
  -- ⚠ 이 줄이 핵심이다. 이 함수는 **pg_cron 전용**이다.
  --   cron 은 postgres 로 돌기 때문에 JWT 가 없어 `auth.uid()` 가 null 이다.
  --   반대로 앱에서 온 호출은 anon 이든 로그인 사용자든 클레임을 달고 온다.
  --   그러니 "클레임이 있으면 사람이 부른 것" 으로 보고 거절한다.
  if auth.uid() is not null
     or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') <> '' then
    raise exception '유지보수 작업은 직접 호출할 수 없습니다.'
      using errcode = 'insufficient_privilege';
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

revoke all on function public.purge_expired_soft_deletes() from public, anon, authenticated;
