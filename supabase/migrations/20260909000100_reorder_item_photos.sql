-- 홈 스토어 — 물건 사진 순서 바꾸기 (2026-09-09 사용자 요청)
--
-- 사진 순서(와 대표 지정)를 **한 번에** 적는 RPC. 카테고리처럼 행마다 update 를 보내면
-- 열 번 왕복에, 중간에 끊기면 순서가 반쯤 적용된다. 사진은 물건당 10장뿐이라 배열로
-- 받아 한 트랜잭션에서 적는다. 대표 사진은 첫 장이고, t61 이 items 에 복사한다 — 여기서
-- items 를 건드리지 않는다.
--
-- ⚠ security invoker — RLS 가 그대로 적용된다. 남의 물건 사진은 보이지도 않으므로
--   "개수가 맞지 않는다" 로 튕긴다. 빠진 장이 있거나 다른 물건의 사진 id 가 섞여도 같다:
--   순서는 **그 물건의 모든 사진**을 빠짐없이 적어야 뜻이 통한다.

create or replace function public.reorder_item_photos(p_item_id uuid, p_photo_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total int;
  v_given int;
begin
  if p_photo_ids is null or array_length(p_photo_ids, 1) is null then
    raise exception '순서를 적을 사진이 없습니다.' using errcode = 'check_violation';
  end if;

  select count(*) into v_total from item_photos where item_id = p_item_id;
  select count(*) into v_given
    from item_photos
   where item_id = p_item_id and id = any(p_photo_ids);

  if v_total = 0 or v_given <> v_total or v_given <> array_length(p_photo_ids, 1) then
    raise exception '이 물건의 사진 전부를 빠짐없이, 한 번씩 적어야 합니다.' using errcode = 'check_violation';
  end if;

  update item_photos ph
     set sort_order = o.idx - 1
    from unnest(p_photo_ids) with ordinality as o(id, idx)
   where ph.id = o.id and ph.item_id = p_item_id;
end;
$$;

revoke all on function public.reorder_item_photos(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_item_photos(uuid, uuid[]) to authenticated;

comment on function public.reorder_item_photos(uuid, uuid[]) is
  '물건 사진의 순서를 배열 순서대로 0부터 다시 적는다. 첫 장이 대표(t61 이 items 에 복사).';
