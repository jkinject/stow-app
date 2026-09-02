-- ═════════════════════════════════════════════════════════════
-- 기존 카테고리에 **어울리는 아이콘**을 한 번 채운다 (2026-09-03)
--
-- 왜: 앞 마이그레이션이 색은 서로 다르게 줬는데 아이콘은 전부 기본값(shape-outline)
--     이라, 목록이 같은 그림 여섯 개로 보였다. 아이콘을 넣은 의미가 없다.
--
-- ⚠ **이미 고른 사람은 건드리지 않는다.** `icon = 'shape-outline'` 인 행만 바꾼다.
--   기본값에서 벗어난 값은 사용자가 골랐다는 뜻이다.
--
-- ⚠ 이름이 안 맞으면 그대로 둔다. 어설프게 맞히느니 기본 그림이 낫다 —
--   "왜 내 '기타' 카테고리에 기타(악기)가 그려져 있지" 가 되면 곤란하다.
--   그래서 부분 일치가 아니라 **정확히 아는 이름만** 짚는다.
--
-- ⚠ 여기 쓰는 이름은 앱의 큐레이션 목록(features/category/icons.ts)에 있는 것들이다.
--   목록에 없는 이름을 넣으면 편집 시트에서 "고른 것" 이 격자에 안 보인다.
-- ═════════════════════════════════════════════════════════════

update public.categories set icon = m.icon
  from (values
    ('공구',       'wrench-outline'),
    ('생활용품',   'spray-bottle'),
    ('시즌용품',   'snowflake'),
    ('여행용품',   'briefcase-outline'),
    ('장난감',     'teddy-bear'),
    ('기타',       'dots-horizontal-circle-outline'),
    ('주방',       'silverware-fork-knife'),
    ('욕실',       'shower'),
    ('의류',       'tshirt-crew-outline'),
    ('약',         'medical-bag'),
    ('전자기기',   'laptop'),
    ('문구',       'pencil-outline'),
    ('반려동물',   'paw-outline'),
    ('식품',       'food-apple-outline'),
    ('청소',       'broom'),
    ('Tools',      'wrench-outline'),
    ('Cleaning',   'broom'),
    ('Kitchen',    'silverware-fork-knife'),
    ('Medicine',   'medical-bag'),
    ('Kids',       'teddy-bear'),
    ('Travel',     'briefcase-outline'),
    ('Seasonal',   'snowflake'),
    ('Clothing',   'tshirt-crew-outline'),
    ('Electronics','laptop'),
    ('Other',      'dots-horizontal-circle-outline')
  ) as m(name, icon)
 where btrim(categories.name) = m.name
   and categories.icon = 'shape-outline';
