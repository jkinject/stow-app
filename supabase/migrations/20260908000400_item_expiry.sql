-- 홈 스토어 — 물건의 소비기한 (2026-09-08 사용자 요청)
--
-- 음식처럼 오래 두는 물건은 소비기한이 있고, 1~2년 뒤면 있는지도 잊는다. 날짜 하나를
-- 물건에 붙여 두면 상세·격자에서 "D-N" 으로 보이고, 앱이 기기 알림을 걸어 둔다.
--
-- ⚠ 알림 발송은 **서버가 하지 않는다.** 서버 푸시는 FCM/APNs 자격 증명이 필요한데 아직
--   없다. 앱이 기기의 로컬 알림을 스케줄한다(features/item/reminders.ts). 그래서 DB 는
--   날짜 하나만 안다 — 알림 설정(며칠 전)은 기기별이다.
--
-- 날짜형(date)이다. 시각은 뜻이 없다 — 소비기한은 "그날까지" 다.

alter table public.items
  add column if not exists expires_on date;

comment on column public.items.expires_on is
  '소비기한(그날까지). null = 기한 없음. 알림은 앱이 기기에서 건다.';

-- 곧 만료되는 것을 찾는 조회용. 기한 없는 물건은 인덱스에 안 들어간다.
create index if not exists items_expires_on
  on public.items(household_id, expires_on)
  where deleted_at is null and expires_on is not null;

-- 변경 이력에 소비기한도 남긴다. 본문은 20260828000400 의 t30 과 같고 한 줄만 더했다.
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
    elsif  new.quantity is distinct from old.quantity                then v_type := 'qty_changed';
    else                                                                 v_type := 'updated';
    end if;
  end if;

  insert into item_events (household_id, item_id, actor_id, type, payload)
  values (new.household_id, new.id, coalesce(auth.uid(), new.updated_by), v_type, v_payload);

  return new;
end;
$$;
