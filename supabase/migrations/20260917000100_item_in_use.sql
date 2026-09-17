-- 홈 스토어 — 물건의 "사용중" 상태 (2026-09-17 사용자 요청)
--
-- 멀티탭·공구·캠핑 장비처럼 **가끔 꺼내 쓰고 다시 제자리에 두는** 물건이 있다. 꺼내 쓰는
-- 동안은 등록된 자리에 없지만, 쓰고 나면 그 자리로 돌아간다. 그래서 위치를 옮기는 것이
-- 아니라 **임시 상태**가 필요하다 — 위치는 그대로 두고 "지금은 제자리에 없다" 만 표시한다.
--
--   in_use_since  — 꺼낸 시각. null 이면 제자리에 보관 중. 상세에서 "N일 전부터" 로 보인다.
--   in_use_by     — 꺼낸 사람. 가족이 같이 쓰므로 "누가 가지고 있나" 가 곧 어디 있나다.
--                   ⚠ 클라이언트가 보내지 않는다. 트리거가 auth.uid() 로 채우고, 제자리에
--                     두면 함께 비운다 (t10 이 updated_by 를 다루는 것과 같은 규칙).
--
-- 수량은 건드리지 않는다. 꺼내 썼다고 재고가 줄어든 것이 아니다.
-- 변경 이력에는 'checked_out' / 'returned' 두 종류로 남는다 — 이력 화면에서
-- "누가 언제 꺼냈고 언제 돌려놨는지" 가 이 기능의 절반이다.

alter table public.items
  add column if not exists in_use_since timestamptz,
  add column if not exists in_use_by    uuid references public.profiles(id) on delete set null;

comment on column public.items.in_use_since is
  '꺼내 쓰기 시작한 시각. null = 제자리에 보관 중. 위치는 그대로다 — 임시 상태.';
comment on column public.items.in_use_by is
  '꺼낸 사람. 트리거 t12 가 auth.uid() 로 채우고 제자리에 두면 비운다. 클라이언트 값은 무시된다.';

-- "지금 나가 있는 것" 을 찾는 조회용. 보관 중인 물건(대다수)은 인덱스에 안 들어간다.
create index if not exists items_in_use
  on public.items(household_id, in_use_since)
  where deleted_at is null and in_use_since is not null;

-- ─────────────────────────────────────────────────────────────
-- t12_in_use_actor — BEFORE INSERT OR UPDATE
--
-- 사용중으로 **전이할 때** 꺼낸 사람을 찍고, 제자리에 두면 둘 다 비운다.
-- 이미 사용중인 물건의 다른 수정(메모 등)은 꺼낸 시각·사람을 건드리지 않는다.
-- t10 뒤에 돌아야 auth.uid() 가 없을 때(시드) updated_by 를 대신 쓸 수 있다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.t12_in_use_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.in_use_since is null then
    new.in_use_by := null;
  elsif tg_op = 'INSERT' or old.in_use_since is null then
    new.in_use_by := coalesce(auth.uid(), new.updated_by);
  else
    -- 사용중인 채로 다른 칸을 고친 것 — 꺼낸 시각·사람은 처음 값 그대로
    new.in_use_since := old.in_use_since;
    new.in_use_by    := old.in_use_by;
  end if;
  return new;
end;
$$;

drop trigger if exists t12_in_use_actor on public.items;
create trigger t12_in_use_actor before insert or update on public.items
  for each row execute function public.t12_in_use_actor();

-- ─────────────────────────────────────────────────────────────
-- 변경 이력 종류 두 개 추가
-- ─────────────────────────────────────────────────────────────
alter table public.item_events drop constraint if exists item_events_type_check;
alter table public.item_events add constraint item_events_type_check
  check (type in ('created','updated','moved','qty_changed','deleted','restored','checked_out','returned'));

-- t30 본문은 20260908000400 과 같고, in_use_since 한 줄과 종류 판정 두 줄만 더했다.
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
    if new.name         is distinct from old.name         then v_payload := v_payload || jsonb_build_object('name',         jsonb_build_array(old.name, new.name)); end if;
    if new.category     is distinct from old.category     then v_payload := v_payload || jsonb_build_object('category',     jsonb_build_array(old.category, new.category)); end if;
    if new.quantity     is distinct from old.quantity     then v_payload := v_payload || jsonb_build_object('quantity',     jsonb_build_array(old.quantity, new.quantity)); end if;
    if new.threshold    is distinct from old.threshold    then v_payload := v_payload || jsonb_build_object('threshold',    jsonb_build_array(old.threshold, new.threshold)); end if;
    if new.unit         is distinct from old.unit         then v_payload := v_payload || jsonb_build_object('unit',         jsonb_build_array(old.unit, new.unit)); end if;
    if new.purchase_url is distinct from old.purchase_url then v_payload := v_payload || jsonb_build_object('purchase_url', jsonb_build_array(old.purchase_url, new.purchase_url)); end if;
    if new.note         is distinct from old.note         then v_payload := v_payload || jsonb_build_object('note',         jsonb_build_array(old.note, new.note)); end if;
    if new.photo_path   is distinct from old.photo_path   then v_payload := v_payload || jsonb_build_object('photo_path',   jsonb_build_array(old.photo_path, new.photo_path)); end if;
    if new.thumb_path   is distinct from old.thumb_path   then v_payload := v_payload || jsonb_build_object('thumb_path',   jsonb_build_array(old.thumb_path, new.thumb_path)); end if;
    if new.expires_on   is distinct from old.expires_on   then v_payload := v_payload || jsonb_build_object('expires_on',   jsonb_build_array(old.expires_on, new.expires_on)); end if;
    if new.in_use_since is distinct from old.in_use_since then v_payload := v_payload || jsonb_build_object('in_use_since', jsonb_build_array(old.in_use_since, new.in_use_since)); end if;
    if new.location_id  is distinct from old.location_id  then v_payload := v_payload || jsonb_build_object('location_id',  jsonb_build_array(old.location_id, new.location_id)); end if;
    if new.container_id is distinct from old.container_id then v_payload := v_payload || jsonb_build_object('container_id', jsonb_build_array(old.container_id, new.container_id)); end if;
    if new.deleted_at   is distinct from old.deleted_at   then v_payload := v_payload || jsonb_build_object('deleted_at',   jsonb_build_array(old.deleted_at, new.deleted_at)); end if;

    if v_payload = '{}'::jsonb then
      return new;
    end if;

    if     old.deleted_at is null     and new.deleted_at is not null then v_type := 'deleted';
    elsif  old.deleted_at is not null and new.deleted_at is null     then v_type := 'restored';
    elsif  new.container_id is distinct from old.container_id
        or new.location_id  is distinct from old.location_id         then v_type := 'moved';
    elsif  old.in_use_since is null     and new.in_use_since is not null then v_type := 'checked_out';
    elsif  old.in_use_since is not null and new.in_use_since is null     then v_type := 'returned';
    elsif  new.quantity is distinct from old.quantity                then v_type := 'qty_changed';
    else                                                                 v_type := 'updated';
    end if;
  end if;

  insert into item_events (household_id, item_id, actor_id, type, payload)
  values (new.household_id, new.id, coalesce(auth.uid(), new.updated_by), v_type, v_payload);

  return new;
end;
$$;
