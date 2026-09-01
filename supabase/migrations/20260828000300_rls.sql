-- 홈 스토어 M1 — RLS (계획 §4.3, 11개 테이블 × 4작업 = 44칸)
--
-- ⚠ 두 방향의 실패가 있다:
--   R2  — RLS 를 안 켜면 데이터가 샌다
--   R18 — 켜놓고 정책을 안 쓰면 전면 거부가 되어 앱이 아무것도 못 읽는다
-- 아래는 11개 테이블 전부에 대해 정책을 명시하고, 의도적으로 두지 않는 곳은
-- 그 이유를 주석으로 남긴다.

-- ═════════════════════════════════════════════════════════════
-- SECURITY DEFINER 헬퍼 — 재귀 차단의 핵심
-- 이 함수들은 소유자 역할로 실행되어 내부 조회에서 RLS 를 우회한다.
-- 따라서 household_members 의 정책이 household_members 를 조회해도
-- 무한 재귀(42P17)가 발생하지 않는다.
-- ═════════════════════════════════════════════════════════════

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- AC20 의 "홍길동님이 수정" 을 렌더하려면 같은 가구 구성원의 프로필을 읽어야 한다.
-- 일반 서브쿼리로 쓰면 household_members RLS 를 타서 재귀하므로 이것도 DEFINER.
create or replace function public.shares_household_with(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from household_members a
    join household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

revoke all on function public.is_household_member(uuid)  from public;
revoke all on function public.is_household_owner(uuid)   from public;
revoke all on function public.shares_household_with(uuid) from public;
grant execute on function public.is_household_member(uuid)   to authenticated;
grant execute on function public.is_household_owner(uuid)    to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════
-- RLS 활성화 — 11개 테이블 전부 (M1 완료조건: rowsecurity=false 인 public 테이블 0행)
-- ═════════════════════════════════════════════════════════════
alter table public.profiles            enable row level security;
alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.invites             enable row level security;
alter table public.locations           enable row level security;
alter table public.containers          enable row level security;
alter table public.items               enable row level security;
alter table public.item_events         enable row level security;
alter table public.shopping_list       enable row level security;
alter table public.device_push_tokens  enable row level security;
alter table public.maintenance_log     enable row level security;
alter table public.app_settings        enable row level security;

-- ═════════════════════════════════════════════════════════════
-- profiles — 본인 + 같은 가구 구성원
-- ═════════════════════════════════════════════════════════════
create policy pr_select on public.profiles for select
  using (id = auth.uid() or shares_household_with(id));
create policy pr_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- INSERT 정책 없음 — 신규 가입 트리거(auth.users → profiles)가 처리
-- DELETE 정책 없음 — 계정 삭제는 M9 의 익명화 경로

-- ═════════════════════════════════════════════════════════════
-- households — ⚠ 컬럼이 household_id 가 아니라 id
-- ═════════════════════════════════════════════════════════════
create policy ho_select on public.households for select
  using (is_household_member(id));
create policy ho_update on public.households for update
  using (is_household_owner(id)) with check (is_household_owner(id));
-- ⚠ INSERT 정책 없음 — 닭과 달걀: 가구를 만드는 순간엔 아직 멤버가 아니라
--    어떤 with check 도 통과할 수 없다. create_household() RPC 가 가구 생성과
--    owner 멤버십 부여를 한 트랜잭션으로 처리한다.
-- DELETE 정책 없음 — 가구 삭제는 M9 계정 삭제 경로에서만

-- ═════════════════════════════════════════════════════════════
-- household_members — is_household_member() 가 DEFINER 라 재귀 없음
-- ═════════════════════════════════════════════════════════════
create policy hm_select on public.household_members for select
  using (is_household_member(household_id));
create policy hm_update on public.household_members for update      -- 알림 on/off (AC17)
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy hm_delete on public.household_members for delete
  using (is_household_owner(household_id) or user_id = auth.uid()); -- owner 추방 or 본인 탈퇴
-- ⚠ INSERT 정책 없음 — 멤버 추가는 create_household / accept_invite RPC 만 (P3)

-- ═════════════════════════════════════════════════════════════
-- invites
-- ═════════════════════════════════════════════════════════════
create policy iv_select on public.invites for select
  using (is_household_member(household_id));
create policy iv_insert on public.invites for insert
  with check (is_household_owner(household_id) and created_by = auth.uid());
create policy iv_delete on public.invites for delete
  using (is_household_owner(household_id));
-- ⚠ UPDATE 정책 없음 — used_by/used_at 은 accept_invite RPC 만 쓴다 (P3)
-- ⚠ 참여자는 아직 멤버가 아니라 iv_select 로 코드를 조회할 수 없다.
--    accept_invite 가 SECURITY DEFINER 여야 하는 이유다.

-- ═════════════════════════════════════════════════════════════
-- locations / containers / items — 가구 스코프 3종
-- 셋 다 DELETE 정책 없음 = 하드삭제 불가, soft delete 만 (AC24)
-- ═════════════════════════════════════════════════════════════
create policy loc_select on public.locations for select using (is_household_member(household_id));
create policy loc_insert on public.locations for insert with check (is_household_member(household_id));
create policy loc_update on public.locations for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy con_select on public.containers for select using (is_household_member(household_id));
create policy con_insert on public.containers for insert with check (is_household_member(household_id));
create policy con_update on public.containers for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy itm_select on public.items for select using (is_household_member(household_id));
create policy itm_insert on public.items for insert with check (is_household_member(household_id));
create policy itm_update on public.items for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- ═════════════════════════════════════════════════════════════
-- item_events — 읽기만. 쓰기는 트리거 전용 (P3)
-- ═════════════════════════════════════════════════════════════
create policy ev_select on public.item_events for select
  using (is_household_member(household_id));
-- ⚠ insert/update/delete 정책 없음 = 클라이언트가 이력을 쓰거나 고칠 수 없다

-- ═════════════════════════════════════════════════════════════
-- shopping_list — 수동 항목만 직접 조작 가능
-- ═════════════════════════════════════════════════════════════
create policy sl_select on public.shopping_list for select
  using (is_household_member(household_id));
create policy sl_insert on public.shopping_list for insert
  with check (is_household_member(household_id) and added_reason = 'manual');
create policy sl_delete on public.shopping_list for delete
  using (is_household_member(household_id) and added_reason = 'manual');
-- ⚠ UPDATE 정책 없음 — resolved_at/resolved_by 는 resolve_shopping_item RPC 만 (P3)

-- ═════════════════════════════════════════════════════════════
-- device_push_tokens — 본인 것만
-- ═════════════════════════════════════════════════════════════
create policy dpt_all on public.device_push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════
-- app_settings — 읽기만 (클라이언트가 상한값을 알아야 UI 안내가 가능)
-- ═════════════════════════════════════════════════════════════
create policy as_select on public.app_settings for select
  using (auth.uid() is not null);
-- 쓰기 정책 없음 — 운영자가 직접 바꾼다

-- ═════════════════════════════════════════════════════════════
-- maintenance_log — 정책 없음 = 클라이언트 전면 차단.
-- pg_cron 은 postgres 역할이라 RLS 를 우회하므로 영향 없다.
-- ═════════════════════════════════════════════════════════════
