-- 홈 스토어 M1 — 확장 + 11개 테이블
-- 계획 §4.2. 스키마 판단은 전부 계획에 근거가 있으므로 임의 변경 금지.

create extension if not exists pg_trgm;

-- ⚠ pg_cron 은 로컬 Docker 에서는 그냥 되지만, 호스팅 Supabase 에서는 프로젝트/플랜에 따라
--   생성 권한이 없어 마이그레이션 전체가 실패할 수 있다. pg_cron 은 30일 휴지통 정리(AC24)
--   에만 쓰이고 그 정리 함수 자체는 pg_cron 없이도 수동/외부 스케줄러로 호출 가능하므로,
--   여기서 실패해도 배포를 막지 않는다. (대시보드 Database > Extensions 에서 켤 수 있다)
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron 확장 생성 건너뜀 (%). 휴지통 자동 정리는 대시보드에서 pg_cron 을 켠 뒤 활성화하세요.', sqlerrm;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 1) profiles
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now()
);
comment on table public.profiles is
  '표시 이름. 계정 삭제 시 행을 지우지 않고 익명화한다 — 지우면 감사 이력이 FK 위반으로 함께 사라진다 (계획 M9)';

-- ─────────────────────────────────────────────────────────────
-- 2) households
-- ─────────────────────────────────────────────────────────────
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
comment on table public.households is
  'INSERT 정책 없음 — 가구 생성은 닭과 달걀이라 create_household() RPC 만 가능 (계획 §4.3)';

-- ─────────────────────────────────────────────────────────────
-- 3) household_members
-- ─────────────────────────────────────────────────────────────
create table public.household_members (
  household_id     uuid not null references public.households(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             text not null default 'member' check (role in ('owner','member')),
  notify_threshold boolean not null default true,   -- AC17 알림 on/off
  joined_at        timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- 4) invites
-- ─────────────────────────────────────────────────────────────
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code         text not null unique check (length(code) between 6 and 32),
  expires_at   timestamptz not null,
  -- ⚠ default auth.uid() 가 없으면 클라이언트가 created_by 를 반드시 보내야 하고,
  --   빠뜨리면 RLS 의 with check (created_by = auth.uid()) 가 42501 로 튕긴다.
  --   서버가 채우면 클라이언트는 보낼 필요도 없고 위조할 수도 없다 (P3).
  created_by   uuid not null default auth.uid() references public.profiles(id),
  used_by      uuid references public.profiles(id),
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
comment on column public.invites.used_by is
  'UPDATE 정책 없음 — accept_invite() RPC 만 스탬프한다 (P3)';

-- ─────────────────────────────────────────────────────────────
-- 5) locations (장소) — 2단계 계층의 상위
-- ─────────────────────────────────────────────────────────────
create table public.locations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  note         text,
  sort_order   int not null default 0,
  created_by   uuid not null references public.profiles(id),
  updated_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- 6) containers (박스) — 2단계 계층의 하위. QR 이 붙는 대상
-- ─────────────────────────────────────────────────────────────
create table public.containers (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  location_id  uuid not null references public.locations(id) on delete restrict,
  name         text not null check (length(btrim(name)) > 0),
  qr_token     uuid not null default gen_random_uuid(),  -- unique 는 §4.5 명시 인덱스로 (중복 방지)
  photo_path   text,
  thumb_path   text,                                     -- 320px 썸네일 (§4.9)
  note         text,
  created_by   uuid not null references public.profiles(id),
  updated_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- 7) items (물건)
-- ─────────────────────────────────────────────────────────────
create table public.items (
  id           uuid primary key,          -- ⚠ default 없음: 클라이언트가 UUID 생성 (낙관적 삽입 중복 차단)
  household_id uuid not null references public.households(id) on delete cascade,
  location_id  uuid not null references public.locations(id) on delete restrict,
  container_id uuid references public.containers(id) on delete set null,  -- ⚠ nullable: 박스 없이 장소 직속인 물건
  name         text not null check (length(btrim(name)) > 0),
  category     text,
  quantity     int not null default 1 check (quantity >= 0),
  threshold    int check (threshold >= 0), -- null = 임계치 알림 대상 아님
  unit         text,
  purchase_url text,
  note         text,
  photo_path   text,                       -- 1280px 원본 — 상세 화면에서만 (§4.9)
  thumb_path   text,                       -- 320px 썸네일 — 목록은 항상 이것만
  created_by   uuid not null references public.profiles(id),
  updated_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- 8) item_events (변경 이력, append-only)
-- ─────────────────────────────────────────────────────────────
create table public.item_events (
  id           bigserial primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  item_id      uuid not null,             -- ⚠ FK 없음: 30일 후 하드삭제돼도 이력은 남아야 한다
  actor_id     uuid references public.profiles(id),
  type         text not null check (type in ('created','updated','moved','qty_changed','deleted','restored')),
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
comment on table public.item_events is
  '⚠ 타임라인 정렬은 반드시 id 로 한다. created_at 의 now() 는 트랜잭션 시작 시각이라 '
  '한 트랜잭션에서 생긴 이벤트들이 같은 값을 갖는다.';

-- ─────────────────────────────────────────────────────────────
-- 9) shopping_list
-- ─────────────────────────────────────────────────────────────
create table public.shopping_list (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  added_reason text not null check (added_reason in ('auto_threshold','manual')),
  added_at     timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id)
);
-- 물건당 미해결 항목은 1건만
create unique index shopping_list_one_open_per_item
  on public.shopping_list(item_id) where resolved_at is null;

-- ─────────────────────────────────────────────────────────────
-- 10) device_push_tokens — AC17 을 위해 스펙 온톨로지에 추가된 테이블
-- ─────────────────────────────────────────────────────────────
create table public.device_push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  expo_token text not null unique,
  platform   text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 11) maintenance_log — pg_cron 안전장치 감사용
-- ─────────────────────────────────────────────────────────────
create table public.maintenance_log (
  id              bigserial primary key,
  job             text not null,
  candidate_count int not null,
  deleted_count   int,
  aborted_reason  text,
  ran_at          timestamptz not null default now()
);
comment on table public.maintenance_log is
  '정책 없음 = 클라이언트 전면 차단. pg_cron 은 postgres 역할이라 RLS 를 우회한다';

-- ─────────────────────────────────────────────────────────────
-- 앱 설정 (무료 티어 ↔ 유료 전환 시 코드 수정 없이 바꾸는 값들)
-- ─────────────────────────────────────────────────────────────
create table public.app_settings (
  key   text primary key,
  value text not null
);

insert into public.app_settings (key, value) values
  ('items_warn_per_household',   '5000'),    -- R15 경고
  ('items_max_per_household',    '10000'),   -- R15 차단
  ('items_max_per_user_per_day', '500'),     -- R15 일일 등록
  ('storage_max_bytes_per_household', '838860800'),  -- 800MB: 무료 티어 (§4.11). 유료 전환 시 2.5GB
  ('cron_delete_batch_abort_over',    '100'); -- S4 안전장치

comment on table public.app_settings is
  '무료 티어(800MB) ↔ 유료(2.5GB) 전환 시 코드 배포 없이 값만 바꾼다 (계획 §4.11)';
