-- 홈 스토어 M3 — soft delete 시 계층 무결성
--
-- 문제: `ON DELETE SET NULL` / `ON DELETE RESTRICT` 는 **하드 삭제**에만 발동한다.
--   우리는 soft delete(deleted_at 설정)만 쓰므로(AC24) FK 가 아무것도 막아주지 않는다.
--   그대로 두면:
--     · 컨테이너를 지워도 물건이 계속 그 컨테이너를 참조 → "3번 박스(삭제됨)" 유령 경로
--     · 장소를 지워도 하위 컨테이너·물건이 남아 조회는 되는데 경로가 끊김
--
-- 계획 M3 완료 조건: "컨테이너를 지우면 그 안의 물건은 사라지지 않고 장소 직속으로 남는다"
-- 이걸 앱이 아니라 DB 에서 강제한다 (P2).

-- ═════════════════════════════════════════════════════════════
-- t45_detach_items — 컨테이너 soft delete 시 물건을 장소 직속으로
--
-- 물건은 사라지지 않는다. container_id 만 null 이 되어 장소에 직접 놓인 상태가 된다.
-- items.container_id 가 nullable 인 이유가 여기서도 쓰인다 (냉장고 우유, 신발장 우산).
-- ⚠ t10 이 감사 필드를 스탬프한 뒤, t50 이 브로드캐스트하기 전에 돌아야 하므로 t45.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t45_detach_items()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    -- 이 UPDATE 는 items 의 t30 을 태워 'moved' 이벤트를 남긴다 (AC21).
    update items
       set container_id = null
     where container_id = new.id and deleted_at is null;
  end if;
  return new;
end;
$$;

create trigger t45_detach_items after update on public.containers
  for each row execute function public.t45_detach_items();

-- ═════════════════════════════════════════════════════════════
-- t45_guard_location — 장소 soft delete 시 하위가 남아 있으면 막는다
--
-- containers.location_id 와 items.location_id 는 NOT NULL 이라 "장소 없음" 상태를
-- 표현할 수 없다. 따라서 컨테이너처럼 분리할 수가 없고, 비우도록 요구하는 수밖에 없다.
-- 조용히 고아를 만드는 것보다 명확히 거부하는 편이 낫다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t45_guard_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n_con int;
  n_itm int;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    select count(*) into n_con from containers where location_id = new.id and deleted_at is null;
    select count(*) into n_itm from items      where location_id = new.id and deleted_at is null;

    if n_con > 0 or n_itm > 0 then
      raise exception '이 장소에 박스 %개, 물건 %개가 남아 있습니다. 먼저 옮기거나 삭제해 주세요.', n_con, n_itm
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger t45_guard_location before update on public.locations
  for each row execute function public.t45_guard_location();

-- ═════════════════════════════════════════════════════════════
-- 목록 화면용 집계 뷰
-- 장소마다 "박스 N개 · 물건 M개" 를 보여주는데, 화면에서 N+1 쿼리를 돌리지 않는다.
-- security_invoker 로 호출자의 RLS 를 그대로 태운다 (뷰가 우회로가 되면 안 된다).
-- ═════════════════════════════════════════════════════════════
create or replace view public.location_summary
with (security_invoker = true) as
select
  l.id,
  l.household_id,
  l.name,
  l.note,
  l.sort_order,
  l.updated_at,
  l.updated_by,
  (select count(*) from containers c where c.location_id = l.id and c.deleted_at is null) as container_count,
  (select count(*) from items i      where i.location_id = l.id and i.deleted_at is null) as item_count
from locations l
where l.deleted_at is null;

create or replace view public.container_summary
with (security_invoker = true) as
select
  c.id,
  c.household_id,
  c.location_id,
  c.name,
  c.qr_token,
  c.photo_path,
  c.thumb_path,
  c.note,
  c.updated_at,
  c.updated_by,
  (select count(*) from items i where i.container_id = c.id and i.deleted_at is null) as item_count
from containers c
where c.deleted_at is null;

grant select on public.location_summary  to authenticated;
grant select on public.container_summary to authenticated;
