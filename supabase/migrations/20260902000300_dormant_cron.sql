-- ═════════════════════════════════════════════════════════════
-- 휴면 정리 작업 스케줄 (2026-09-02)
--
-- 판정은 SQL, 부작용(메일·파일 삭제)은 Edge Function `household-lifecycle`.
-- 그 함수를 매일 부르려면 Postgres 가 HTTP 를 쳐야 한다 → pg_net.
--
-- ⚠⚠ **service_role 키를 DB 에 두지 않는다.** vault 에 넣으면 SECURITY DEFINER 함수
--   하나만 뚫려도 전체 데이터에 닿는다. DB 에 두는 것은 이 작업을 한 번 더 돌릴 수만
--   있는 `cron_secret` 뿐이다 — 새어도 할 수 있는 일이 멱등한 정리 한 번이다.
--
-- ⚠ 이 파일은 **로컬에서는 아무것도 하지 않는다.** vault 에 값이 없으면 조용히
--   건너뛴다. 값 넣기는 운영에서 한 번만 한다 (아래 주석 참고).
--
--   운영 준비 (한 번만, Supabase SQL Editor 에서):
--     select vault.create_secret('<임의의 긴 문자열>', 'cron_secret');
--     select vault.create_secret('https://<project>.supabase.co/functions/v1',
--                                'functions_base_url');
--   Edge Function 쪽에도 같은 값을 넣는다:
--     supabase secrets set CRON_SECRET=<같은 값> RESEND_API_KEY=... RESEND_SENDER=...
-- ═════════════════════════════════════════════════════════════

create extension if not exists pg_net with schema extensions;

create or replace function public.run_household_lifecycle()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    -- 로컬·미설정 환경. 조용히 넘긴다 — 매일 오류 로그를 쌓을 이유가 없다.
    insert into maintenance_log (job, candidate_count, deleted_count, aborted_reason)
    values ('run_household_lifecycle', 0, 0, 'vault 에 functions_base_url/cron_secret 이 없어 건너뜀');
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/household-lifecycle',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function public.run_household_lifecycle() from public, anon, authenticated;

-- 매일 04:40 KST(=19:40 UTC 전일). 휴지통 정리(04:10)보다 **뒤에** 둔다 —
-- 그래야 그날 purge 가 큐에 넣은 경로까지 같은 날 치운다.
do $$
begin
  perform cron.schedule('household-lifecycle', '40 19 * * *',
                        $c$select public.run_household_lifecycle();$c$);
exception when others then
  raise notice 'pg_cron 스케줄 등록 건너뜀: %', sqlerrm;
end;
$$;
