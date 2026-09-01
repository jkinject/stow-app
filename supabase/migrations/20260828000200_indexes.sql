-- 홈 스토어 M1 — 인덱스 (계획 §4.5)

-- 활성 행 조회 (기본 쿼리는 항상 deleted_at is null 을 건다)
create index items_hh_active        on public.items(household_id)  where deleted_at is null;
create index items_container_active on public.items(container_id)  where deleted_at is null;
create index items_location_active  on public.items(location_id)   where deleted_at is null;
create index items_category         on public.items(household_id, category) where deleted_at is null;
create index containers_hh_active   on public.containers(household_id) where deleted_at is null;
create index locations_hh_active    on public.locations(household_id)  where deleted_at is null;

-- 증분 동기화 (updated_at > lastSync)
create index items_updated_at on public.items(household_id, updated_at desc);

-- 서버측 이름 부분일치. ⚠ 초성 검색은 pg_trgm 으로 불가능 —
-- 클라이언트 메모리 인덱스가 전담한다 (계획 §4.5 결정)
create index items_name_trgm on public.items using gin (name gin_trgm_ops);

-- QR 스캔. §4.2 DDL 에 unique 제약을 두지 않고 여기서만 건다 (중복 인덱스 방지)
create unique index containers_qr on public.containers(qr_token);

-- 이력 타임라인
-- ⚠ 정렬 키는 created_at 이 아니라 id 다. created_at 의 default 인 now() 는
--   **트랜잭션 시작 시각**이라, 한 트랜잭션에서 생긴 이벤트들이 전부 같은 값을 갖는다
--   (예: 한 UPDATE 가 moved 와 qty_changed 를 동시에 유발). bigserial id 만이 순서를 결정한다.
create index events_item_recent on public.item_events(item_id, id desc);
create index events_hh_recent   on public.item_events(household_id, id desc);

-- 구매 리스트 (미해결만)
create index shopping_open on public.shopping_list(household_id) where resolved_at is null;

-- 휴지통 (AC24) 과 pg_cron 만료 스캔.
-- ⚠ 위의 부분 인덱스는 전부 `where deleted_at is null` 이라 여기엔 무용하다
create index items_trash      on public.items(household_id, deleted_at desc)      where deleted_at is not null;
create index containers_trash on public.containers(household_id, deleted_at desc) where deleted_at is not null;
create index locations_trash  on public.locations(household_id, deleted_at desc)  where deleted_at is not null;

-- R15 일일 등록 건수 판정용
create index events_actor_created_day
  on public.item_events(actor_id, created_at) where type = 'created';

-- 멤버십 조회 (RLS 헬퍼가 매 행마다 탄다)
create index household_members_user on public.household_members(user_id);
