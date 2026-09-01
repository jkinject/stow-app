-- 홈 스토어 M1 — 트리거 (계획 §4.4)
--
-- ⚠ PostgreSQL 은 같은 timing/event 의 트리거를 이름 알파벳 순으로 실행하고,
--   앞 트리거가 행을 변형하면 뒤 트리거는 변형된 행을 본다.
--   따라서 모든 트리거 이름에 번호 접두사를 강제한다: t05 → t10 → t20 → t30 → t40 → t50

-- ═════════════════════════════════════════════════════════════
-- 신규 가입 → profiles 생성
-- profiles 에 INSERT 정책이 없으므로 이 트리거만이 유일한 생성 경로다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      '이름 없음'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═════════════════════════════════════════════════════════════
-- t05_rate_limit — items BEFORE INSERT (R15)
-- t10 보다 먼저 돌아야 무의미한 스탬프 작업을 피한다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t05_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_max        int;
  v_daily_max  int;
  v_count      int;
  v_today      int;
begin
  select value::int into v_max       from app_settings where key = 'items_max_per_household';
  select value::int into v_daily_max from app_settings where key = 'items_max_per_user_per_day';

  select count(*) into v_count
    from items where household_id = new.household_id and deleted_at is null;

  if v_count >= v_max then
    raise exception '가구당 물건 수 상한(%건)에 도달했습니다. 쓰지 않는 물건을 정리해 주세요.', v_max
      using errcode = 'check_violation';
  end if;

  if auth.uid() is not null then
    select count(*) into v_today
      from item_events
      where actor_id = auth.uid()
        and type = 'created'
        and created_at >= date_trunc('day', now());

    if v_today >= v_daily_max then
      raise exception '하루 등록 한도(%건)를 넘었습니다. 내일 다시 시도해 주세요.', v_daily_max
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger t05_rate_limit
  before insert on public.items
  for each row execute function public.t05_rate_limit();

-- ═════════════════════════════════════════════════════════════
-- t10_stamp_actor — 감사 필드를 서버가 강제 스탬프 (AC20, P3)
-- 클라이언트가 보낸 created_by/updated_by 값은 무시된다.
-- auth.uid() 가 null 인 경우(시드·크론)에만 전달값을 존중한다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t10_stamp_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
    new.created_at := now();
    new.updated_at := now();
  else
    new.created_by := old.created_by;   -- 생성자는 불변
    new.created_at := old.created_at;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger t10_stamp_actor before insert or update on public.locations
  for each row execute function public.t10_stamp_actor();
create trigger t10_stamp_actor before insert or update on public.containers
  for each row execute function public.t10_stamp_actor();
create trigger t10_stamp_actor before insert or update on public.items
  for each row execute function public.t10_stamp_actor();

-- ═════════════════════════════════════════════════════════════
-- t20_enforce_container_location — 2단계 계층 무결성
-- 물건의 컨테이너는 반드시 물건과 같은 장소·가구에 있어야 한다.
-- 불일치 시 컨테이너 쪽 장소로 자동 정렬한다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t20_enforce_container_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_loc uuid;
  v_hh  uuid;
begin
  if new.container_id is not null then
    select location_id, household_id into v_loc, v_hh
      from containers where id = new.container_id;

    if v_loc is null then
      raise exception '존재하지 않는 컨테이너입니다.' using errcode = 'foreign_key_violation';
    end if;

    if v_hh <> new.household_id then
      raise exception '다른 가구의 컨테이너에는 물건을 넣을 수 없습니다.' using errcode = 'check_violation';
    end if;

    new.location_id := v_loc;   -- 자동 정렬
  end if;
  return new;
end;
$$;

create trigger t20_enforce_container_location before insert or update on public.items
  for each row execute function public.t20_enforce_container_location();

-- ═════════════════════════════════════════════════════════════
-- t30_log_item_event — 변경 이력 append (AC21)
-- ⚠ diff 에서 updated_by / updated_at 을 제외한다.
--   t10 이 매번 바꾸므로 포함하면 모든 이벤트에 노이즈가 낀다.
-- ═════════════════════════════════════════════════════════════
create or replace function public.t30_log_item_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type    text;
  v_payload jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_type := 'created';
    v_payload := jsonb_build_object(
      'name', new.name, 'quantity', new.quantity,
      'location_id', new.location_id, 'container_id', new.container_id
    );
  else
    -- 변경된 필드만 모은다 (감사 필드 제외)
    if new.name         is distinct from old.name         then v_payload := v_payload || jsonb_build_object('name',         jsonb_build_array(old.name, new.name)); end if;
    if new.category     is distinct from old.category     then v_payload := v_payload || jsonb_build_object('category',     jsonb_build_array(old.category, new.category)); end if;
    if new.quantity     is distinct from old.quantity     then v_payload := v_payload || jsonb_build_object('quantity',     jsonb_build_array(old.quantity, new.quantity)); end if;
    if new.threshold    is distinct from old.threshold    then v_payload := v_payload || jsonb_build_object('threshold',    jsonb_build_array(old.threshold, new.threshold)); end if;
    if new.unit         is distinct from old.unit         then v_payload := v_payload || jsonb_build_object('unit',         jsonb_build_array(old.unit, new.unit)); end if;
    if new.purchase_url is distinct from old.purchase_url then v_payload := v_payload || jsonb_build_object('purchase_url', jsonb_build_array(old.purchase_url, new.purchase_url)); end if;
    if new.note         is distinct from old.note         then v_payload := v_payload || jsonb_build_object('note',         jsonb_build_array(old.note, new.note)); end if;
    if new.photo_path   is distinct from old.photo_path   then v_payload := v_payload || jsonb_build_object('photo_path',   jsonb_build_array(old.photo_path, new.photo_path)); end if;
    if new.thumb_path   is distinct from old.thumb_path   then v_payload := v_payload || jsonb_build_object('thumb_path',   jsonb_build_array(old.thumb_path, new.thumb_path)); end if;
    if new.location_id  is distinct from old.location_id  then v_payload := v_payload || jsonb_build_object('location_id',  jsonb_build_array(old.location_id, new.location_id)); end if;
    if new.container_id is distinct from old.container_id then v_payload := v_payload || jsonb_build_object('container_id', jsonb_build_array(old.container_id, new.container_id)); end if;
    if new.deleted_at   is distinct from old.deleted_at   then v_payload := v_payload || jsonb_build_object('deleted_at',   jsonb_build_array(old.deleted_at, new.deleted_at)); end if;

    -- 감사 필드만 바뀐 변경(=t10 이 만든 것)은 이벤트를 남기지 않는다
    if v_payload = '{}'::jsonb then
      return new;
    end if;

    -- 우선순위대로 하나의 type 을 정한다. 전체 diff 는 payload 에 남는다.
    if     old.deleted_at is null     and new.deleted_at is not null then v_type := 'deleted';
    elsif  old.deleted_at is not null and new.deleted_at is null     then v_type := 'restored';
    elsif  new.container_id is distinct from old.container_id
        or new.location_id  is distinct from old.location_id         then v_type := 'moved';
    elsif  new.quantity is distinct from old.quantity                then v_type := 'qty_changed';
    else                                                                 v_type := 'updated';
    end if;
  end if;

  insert into item_events (household_id, item_id, actor_id, type, payload)
  values (new.household_id, new.id, coalesce(auth.uid(), new.updated_by), v_type, v_payload);

  return new;
end;
$$;

create trigger t30_log_item_event after insert or update on public.items
  for each row execute function public.t30_log_item_event();

-- ═════════════════════════════════════════════════════════════
-- t40_sync_shopping_list — 임계치 편입/해제 (AC16)
-- ① 임계치 이하로 **전이**할 때만 삽입 (이미 이하인 상태의 추가 감소는 중복 삽입 안 함)
-- ② 임계치 초과로 복귀하면 미해결 자동항목 해제
-- ③ soft delete 되면 미해결 자동항목 해제
--    — 30일 후 하드삭제 시 CASCADE 로 조용히 사라지는 경합을 차단
-- ═════════════════════════════════════════════════════════════
create or replace function public.t40_sync_shopping_list()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_low boolean;
  is_low  boolean;
begin
  -- ③ soft delete
  if old.deleted_at is null and new.deleted_at is not null then
    update shopping_list
       set resolved_at = now()
     where item_id = new.id and resolved_at is null and added_reason = 'auto_threshold';
    return new;
  end if;

  was_low := (old.deleted_at is null) and (old.threshold is not null) and (old.quantity <= old.threshold);
  is_low  := (new.deleted_at is null) and (new.threshold is not null) and (new.quantity <= new.threshold);

  if is_low and not was_low then
    -- ① 전이 시에만 삽입. 부분 unique 인덱스가 중복을 한 번 더 막는다.
    insert into shopping_list (household_id, item_id, added_reason)
    values (new.household_id, new.id, 'auto_threshold')
    on conflict do nothing;

  elsif was_low and not is_low then
    -- ② 복귀 시 자동항목만 해제. 수동 항목은 사용자가 지운다.
    update shopping_list
       set resolved_at = now()
     where item_id = new.id and resolved_at is null and added_reason = 'auto_threshold';
  end if;

  return new;
end;
$$;

create trigger t40_sync_shopping_list after update on public.items
  for each row execute function public.t40_sync_shopping_list();

-- ═════════════════════════════════════════════════════════════
-- t50_broadcast — Realtime 발행 (AC23)
--
-- ⚠ realtime.send() 는 내부적으로 realtime.messages 에 INSERT 한다.
--   그 INSERT 가 실패하면 **원 트랜잭션 전체가 롤백된다** — 즉 Realtime 이라는
--   편의 기능의 장애가 물건 등록 자체를 막는다.
--   Realtime 은 정합성 요소가 아니라 UX 최적화이므로 예외를 삼키고
--   클라이언트의 주기적 재조회에 맡긴다. (R16 / Architect S2)
-- ═════════════════════════════════════════════════════════════
create or replace function public.t50_broadcast()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'id', new.id, 'op', lower(tg_op)),
      'change',
      'household:' || new.household_id::text,
      true
    );
  exception when others then
    null;   -- 의도적으로 삼킨다. 위 주석 참조.
  end;
  return new;
end;
$$;

create trigger t50_broadcast after insert or update on public.locations
  for each row execute function public.t50_broadcast();
create trigger t50_broadcast after insert or update on public.containers
  for each row execute function public.t50_broadcast();
create trigger t50_broadcast after insert or update on public.items
  for each row execute function public.t50_broadcast();
