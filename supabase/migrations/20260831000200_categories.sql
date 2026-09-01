-- ═════════════════════════════════════════════════════════════
-- 카테고리를 독립 엔티티로 (2026-08-31, deep-interview-categories.md)
--
-- 전: items.category 는 자유 문자열. 목록이 없어 오타·유사 중복이 쌓인다.
-- 후: categories 테이블 + items.category_id. 물건은 만들어 둔 것 중에서 고른다.
-- ═════════════════════════════════════════════════════════════

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  created_by   uuid not null default auth.uid() references public.profiles(id),
  updated_by   uuid not null default auth.uid() references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 가구 안에서 이름은 유일하다 (C5). 대소문자·앞뒤 공백을 무시해 "화장품" 과 "화장품 " 을
-- 다른 것으로 취급하지 않는다 — 목록 전용으로 바꾼 이유가 중복 제거이기 때문이다.
create unique index categories_name_uniq
  on public.categories(household_id, lower(btrim(name)));

create index categories_household on public.categories(household_id);

-- ⚠ **ON DELETE SET NULL 이 이 기능의 핵심 안전장치다.**
--   카테고리를 지우면 그것을 쓰던 물건의 category_id 만 비워지고 물건은 남는다(C2).
--   CASCADE 였다면 카테고리 하나를 지울 때 물건 수십 개가 함께 사라진다.
--   애플리케이션 코드가 아니라 **DB 가** 보장해야 하는 종류의 규칙이다.
alter table public.items
  add column category_id uuid references public.categories(id) on delete set null;

create index items_category_id
  on public.items(household_id, category_id) where deleted_at is null;

-- ⚠ 옛 `items.category` (text) 는 **드롭하지 않는다.**
--   드롭은 되돌릴 수 없다. 읽지 않을 뿐이며, 이관도 하지 않는다 —
--   기존 값을 버리는 것이 명시적 결정이다(C3).
comment on column public.items.category is
  '⚠ 2026-08-31 부터 사용하지 않는다. category_id 를 쓸 것. 드롭하지 않고 남겨 둔다.';

-- ─────────────────────────── RLS ───────────────────────────
-- ⚠ 새 테이블은 enable 만 하고 정책을 빠뜨리기 쉽다. M1 에서 실제로 겪었다(R18).
--   RLS 가 켜져 있고 정책이 없으면 **전면 거부**가 되어 조용히 안 보인다.
alter table public.categories enable row level security;

create policy cat_select on public.categories for select
  using (is_household_member(household_id));

create policy cat_insert on public.categories for insert
  with check (is_household_member(household_id));

create policy cat_update on public.categories for update
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy cat_delete on public.categories for delete
  using (is_household_member(household_id));

-- 커버리지: categories × {select, insert, update, delete} = 4칸, 전부 멤버십 기준.
-- owner 전용 제약을 두지 않는다 — 카테고리는 정리 도구이지 권한 경계가 아니다.

-- ─────────────────────────── 트리거 ───────────────────────────
-- created_by/updated_by 를 서버가 스탬프한다 (P3 — 클라이언트가 보낸 값을 믿지 않는다)
create trigger t10_stamp_actor before insert or update on public.categories
  for each row execute function public.t10_stamp_actor();

comment on table public.categories is
  '가구가 소유하는 물건 카테고리. items.category_id 가 ON DELETE SET NULL 로 참조하므로 '
  '카테고리를 지워도 물건은 남고 분류만 비워진다.';
