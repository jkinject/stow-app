-- 홈 스토어 — 박스를 통째로 다른 장소로 옮기기 (2026-09-05 사용자 요청)
--
-- 물건 하나는 옮길 수 있었는데(items.container_id 수정) **박스는 못 옮겼다.**
-- 그런데 실제 정리는 박스째 움직인다 — "이 박스 안방으로 뺀다" 가 물건 스무 개를
-- 하나씩 옮기는 것보다 훨씬 흔한 일이다. 지금까지는 새 장소에 박스를 다시 만들고
-- 물건을 하나씩 옮기는 수밖에 없었다.
--
-- 앱에서 containers.location_id 만 바꾸면 되는 것처럼 보이지만 그렇지 않다.

-- ═════════════════════════════════════════════════════════════
-- t22_enforce_location_household — 박스의 장소는 같은 가구여야 한다
--
-- ⚠ 여기엔 지금까지 **아무 보호가 없었다.** containers.location_id 는 FK 일 뿐이고,
--   RLS 의 with check 는 `household_id` 만 본다. 즉 남의 가구 장소 id 를 실어 보내면
--   그대로 저장됐다. 그러면 아래 t46 이 그 장소를 물건에 퍼뜨려, 내 물건이 볼 수도
--   없는 장소에 속한 것으로 남는다 — 경로가 끊긴 물건은 되찾을 방법이 없다.
--   items 에는 같은 보호가 t20 으로 이미 있다. 박스에만 없었던 것이다.
--
-- ⚠ **장소가 바뀔 때만** 본다. 모든 UPDATE 에서 검사하면, 삭제된 장소에 들어 있던
--   박스를 휴지통에서 되살릴 때(장소는 그대로, deleted_at 만 null) 걸려서 복구가
--   막힌다. 이 트리거가 막아야 하는 것은 "옮기는 행위" 하나다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t22_enforce_location_household()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hh uuid;
begin
  if tg_op = 'UPDATE' and new.location_id is not distinct from old.location_id then
    return new;
  end if;

  select household_id into v_hh from locations where id = new.location_id;

  if v_hh is null then
    raise exception '존재하지 않는 장소입니다.' using errcode = 'foreign_key_violation';
  end if;

  if v_hh <> new.household_id then
    raise exception '다른 가구의 장소로는 박스를 옮길 수 없습니다.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger t22_enforce_location_household before insert or update on public.containers
  for each row execute function public.t22_enforce_location_household();

-- ═════════════════════════════════════════════════════════════
-- t46_relocate_items — 박스를 옮기면 안의 물건도 따라간다
--
-- ⚠⚠ **이게 이 마이그레이션의 핵심이다.** items 는 `container_id` 와 `location_id` 를
--   둘 다 들고 있다(박스에 안 들어간 물건이 있어야 하므로). 장소를 물건에서 지우고
--   박스를 따라가게 만들 수는 없다는 뜻이다.
--
--   t20 은 **items 가 바뀔 때만** 돈다. 그래서 박스의 장소만 고치면 안에 든 물건은
--   옛 장소를 그대로 들고 남는다: 박스 화면에는 "안방 › 3번 박스" 로 보이는데
--   찾기 결과와 장소 화면에는 여전히 "현관" 으로 뜬다. 물건을 찾아 주는 앱에서
--   가장 나쁜 종류의 거짓말이라, 앱이 아니라 DB 에서 강제한다 (P2).
--
-- ⚠ 이 UPDATE 는 items 의 t30 을 태워 물건마다 'moved' 이벤트를 남긴다 (AC21).
--   박스 하나에 물건 스무 개면 이벤트도 스무 개다. 그게 맞다 — 나중에 "이 물건이
--   언제 안방으로 갔지?" 를 묻는 사람에게 답할 수 있는 건 그 기록뿐이다.
--
-- ⚠ 지워진 물건(deleted_at 있음)은 건드리지 않는다. 휴지통에서 되살아날 때 t20 이
--   박스 쪽 장소로 알아서 맞춰 준다 — 지금 굳이 손댈 이유가 없다.
--
-- ⚠ t45_detach_items 보다 **뒤**에 돌아야 한다(이름순 = 실행 순서). 삭제와 이동이
--   한 UPDATE 에 겹치면 물건은 이미 박스에서 풀려 나온 뒤이고, 그때는 장소를
--   따라 옮기면 안 된다 — 박스를 지우면 물건은 있던 장소에 남는다(M3).
-- ═════════════════════════════════════════════════════════════
create or replace function public.t46_relocate_items()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.location_id is distinct from old.location_id and new.deleted_at is null then
    update items
       set location_id = new.location_id
     where container_id = new.id
       and deleted_at is null
       and location_id is distinct from new.location_id;
  end if;
  return new;
end;
$$;

create trigger t46_relocate_items after update on public.containers
  for each row execute function public.t46_relocate_items();
