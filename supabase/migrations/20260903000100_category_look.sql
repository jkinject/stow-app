-- ═════════════════════════════════════════════════════════════
-- 카테고리에 **생김새**를 준다 — 색 · 아이콘 · 설명 · 순서 (2026-09-03 사용자 요청)
--
-- 왜: 카테고리가 이름뿐이라 목록이 글자 줄로만 보였다. 물건을 분류하는 것은 훑어보며
--     하는 일이라, 색과 그림이 있으면 읽지 않고도 찾는다.
--
-- ⚠ 네 컬럼 모두 **NOT NULL + 기본값**이다. null 을 허용하면 화면마다
--   "없으면 뭘 보여줄지" 를 따로 정해야 하고, 그 판단이 화면마다 갈린다.
--   기본값을 DB 가 책임지면 앱은 그냥 그리면 된다.
--
-- ⚠ `color` 는 `#RRGGBB` 만 받는다. 자유 문자열로 두면 'red' · 'rgb(1,2,3)' ·
--   8자리 헥사가 섞여 들어오고, 그걸 화면에서 다시 판별해야 한다.
--   (MovePicker 주석 참고 — 8자리 헥사를 잘못 이어 붙여 깨진 색이 나온 적이 있다)
--
-- ⚠ `icon` 은 **아이콘 이름 문자열**이다. 앱의 아이콘 팩(MaterialCommunityIcons)에
--   있는 이름을 넣는다. DB 는 이름의 유효성을 모른다 — 없는 이름이면 앱이 기본 그림을
--   그린다. 팩을 바꾸더라도 데이터를 마이그레이션하지 않아도 되게 느슨하게 둔다.
--
-- ⚠ `sort_order` 는 사용자가 정하는 순서다. 기본 0 이고, 같으면 이름순으로 갈린다
--   (앱이 `order('sort_order').order('name')` 로 읽는다).
-- ═════════════════════════════════════════════════════════════

alter table public.categories
  add column if not exists color       text not null default '#6366F1'
    check (color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists icon        text not null default 'shape-outline'
    check (length(btrim(icon)) > 0),
  add column if not exists description text not null default '',
  add column if not exists sort_order  int  not null default 0;

comment on column public.categories.color is
  '타일 바탕색. #RRGGBB 만 허용한다 — 형식을 섞으면 화면에서 다시 판별해야 한다.';
comment on column public.categories.icon is
  '아이콘 팩(MaterialCommunityIcons)의 이름. 없는 이름이면 앱이 기본 그림을 그린다.';
comment on column public.categories.description is
  '한 줄 설명. 빈 문자열이 기본 — null 을 허용하면 화면마다 처리가 갈린다.';
comment on column public.categories.sort_order is
  '사용자가 정한 순서. 같으면 이름순.';

-- ⚠ 기존 카테고리에 **서로 다른 색**을 준다. 전부 같은 색이면 색을 넣은 의미가 없다.
--   이름순으로 팔레트를 돌려 가며 배정한다(결정적이라 다시 돌려도 같은 결과).
with ranked as (
  select id, (row_number() over (partition by household_id order by name) - 1) % 8 as slot
    from public.categories
)
update public.categories c
   set color = (array['#6366F1','#2563EB','#16A34A','#D97706',
                      '#DB2777','#0D9488','#7C3AED','#DC2626'])[r.slot + 1]
  from ranked r
 where r.id = c.id;

-- 순서도 이름순으로 한 번 채워 둔다. 안 채우면 전부 0 이라 "정렬 편집" 첫 화면에서
-- 순서가 뒤죽박죽으로 보인다(같은 값이면 이름순으로 갈리긴 하지만, 한 번 옮기는
-- 순간 나머지가 전부 0 이라 어디로 갈지 예측이 안 된다).
with ranked as (
  select id, row_number() over (partition by household_id order by name) as n
    from public.categories
)
update public.categories c set sort_order = r.n from ranked r where r.id = c.id;

create index if not exists categories_sort
  on public.categories(household_id, sort_order, name);
