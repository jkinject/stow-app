-- ═════════════════════════════════════════════════════════════
-- 기존 카테고리에 **설명**을 한 번 채운다 (2026-09-03)
--
-- 왜: 앞 마이그레이션이 색과 아이콘은 채웠는데 설명이 비어 있어, 목록의 각 줄이
--     이름 한 줄로만 보였다. 레퍼런스는 이름 아래 "드라이버, 망치, 렌치 등" 처럼
--     **무엇이 들어가는지**를 적어 두는 형태다 — 그게 있어야 분류를 고를 때 망설이지 않는다.
--
-- ⚠ 앞의 아이콘 시드와 **같은 규칙**이다: 비어 있는 행만 채우고, 정확히 아는 이름만
--   짚는다. 사용자가 적어 둔 설명은 건드리지 않는다.
-- ═════════════════════════════════════════════════════════════

update public.categories set description = m.d
  from (values
    ('공구',       '드라이버, 망치, 렌치 등'),
    ('생활용품',   '청소용품, 세제 등'),
    ('시즌용품',   '계절에 따라 사용하는 용품'),
    ('여행용품',   '여행에 필요한 물품'),
    ('장난감',     '아이 장난감 및 관련 용품'),
    ('기타',       '기타 물품'),
    ('주방',       '조리도구, 그릇 등'),
    ('욕실',       '세면용품, 수건 등'),
    ('의류',       '옷, 신발, 가방'),
    ('약',         '상비약, 의료용품'),
    ('전자기기',   '충전기, 케이블, 기기'),
    ('문구',       '펜, 노트, 사무용품'),
    ('반려동물',   '사료, 용품'),
    ('식품',       '식료품, 간식'),
    ('청소',       '청소도구, 세제'),
    ('Tools',      'Screwdrivers, hammers, wrenches'),
    ('Cleaning',   'Cleaning supplies and detergents'),
    ('Kitchen',    'Cookware and tableware'),
    ('Medicine',   'First aid and medical supplies'),
    ('Kids',       'Toys and children''s things'),
    ('Travel',     'Things you pack for a trip'),
    ('Seasonal',   'Used only in some seasons'),
    ('Clothing',   'Clothes, shoes, bags'),
    ('Electronics','Chargers, cables, devices'),
    ('Other',      'Everything else')
  ) as m(name, d)
 where btrim(categories.name) = m.name
   and btrim(categories.description) = '';
