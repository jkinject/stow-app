-- ═════════════════════════════════════════════════════════════
-- 구매 리스트 기준 변경: 임계치 → **수량 0** (2026-08-31, 사용자 결정)
--
-- 왜: 임계치를 물건마다 정하는 것 자체가 일이다. 실제로 쓰이지 않았고,
--     "다 떨어지면 사야 한다" 는 규칙이면 충분하다는 판단.
--
-- ⚠ `items.threshold` 컬럼은 **남겨 둔다.** 드롭은 되돌릴 수 없고, 이미 값을 넣어 둔
--   물건이 있을 수 있다. 트리거와 UI 가 더 이상 보지 않을 뿐이다.
--   나중에 임계치를 되살리기로 하면 컬럼이 그대로 있다.
--
-- ⚠ 기존에 임계치로 편입된 미해결 항목은 그대로 둔다. 수량이 오르면 아래 규칙이
--   해제하고, 0 이 아니면서 남아 있는 것은 사용자가 직접 뺄 수 있다(수동 항목이 아니면
--   RLS 가 막으므로, 아래에서 한 번 정리해 준다).
-- ═════════════════════════════════════════════════════════════

create or replace function public.t40_sync_shopping_list()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_out boolean;
  is_out  boolean;
begin
  -- soft delete 되면 미해결 자동항목 해제 (기존과 동일)
  if old.deleted_at is null and new.deleted_at is not null then
    update shopping_list
       set resolved_at = now()
     where item_id = new.id and resolved_at is null and added_reason = 'auto_threshold';
    return new;
  end if;

  -- ⚠ 판정 기준이 `quantity = 0` 으로 바뀌었다. threshold 는 더 이상 보지 않는다.
  was_out := (old.deleted_at is null) and (old.quantity = 0);
  is_out  := (new.deleted_at is null) and (new.quantity = 0);

  if is_out and not was_out then
    -- 0 으로 **전이할 때만** 삽입. 이미 0 인 상태의 다른 수정은 중복을 만들지 않는다.
    insert into shopping_list (household_id, item_id, added_reason)
    values (new.household_id, new.id, 'auto_threshold')
    on conflict do nothing;

  elsif was_out and not is_out then
    -- 채워 넣으면 자동으로 목록에서 빠진다
    update shopping_list
       set resolved_at = now()
     where item_id = new.id and resolved_at is null and added_reason = 'auto_threshold';
  end if;

  return new;
end;
$$;

-- 기준이 바뀌었으므로, **수량이 0 이 아닌데** 자동 편입돼 있던 항목을 정리한다.
-- (임계치 시절에 들어온 것들 — 새 규칙에서는 살 이유가 없다)
update public.shopping_list sl
   set resolved_at = now()
  from public.items i
 where sl.item_id = i.id
   and sl.resolved_at is null
   and sl.added_reason = 'auto_threshold'
   and i.quantity <> 0;

comment on function public.t40_sync_shopping_list() is
  '수량이 0 으로 전이하면 구매 리스트에 넣고, 0 에서 벗어나면 뺀다. '
  'threshold 는 2026-08-31 부터 보지 않는다(컬럼은 보존).';
