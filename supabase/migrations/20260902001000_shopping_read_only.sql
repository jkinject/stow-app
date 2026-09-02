-- ═════════════════════════════════════════════════════════════
-- 구매 리스트를 **읽기 전용**으로 (2026-09-02, 사용자 결정)
--
-- 왜: "살 것에 담기"(수동 편입)를 없앴다. 사용자 판단 —
--     "수량이 0개 되면 알아서 들어가지는건데 왜 별도 기능으로 뺀거야?"
--
--     원래 의도는 "다 떨어지기 전에 미리 사두기" 였는데, 임계치를 사용자가 정할 수
--     없게 된 뒤로(2026-08-31) 수동과 자동의 차이가 화면에서 보이지 않았다.
--     규칙이 "다 떨어지면 살 것에 올라간다" 하나면 설명할 것이 없다.
--
-- ⚠ 트리거는 **영향받지 않는다.** `t40_sync_shopping_list` 는 SECURITY DEFINER 라
--   RLS 를 거치지 않는다. 자동 편입·해제는 그대로 동작한다.
--
-- ⚠ `resolve_shopping_item` RPC 도 영향받지 않는다. 원래부터 UPDATE 정책 없이
--   SECURITY DEFINER 로만 도는 길이었다.
--
-- ⚠ `added_reason` 컬럼은 **남겨 둔다.** 이 저장소는 같은 판단을 이미 한 번 했다
--   (`items.threshold`, 2026-08-31): 드롭은 되돌릴 수 없고, 이미 들어간 값이 있을 수
--   있으며, 되살리기로 하면 컬럼이 그대로 있어야 한다. 값은 이제 항상
--   'auto_threshold' 다. check 제약도 그대로 둔다 — 좁히면 기존 행이 걸릴 수 있다.
--
-- ⚠ 이미 들어가 있는 수동 항목은 지우지 않는다. 화면이 구역을 나누지 않으므로 그냥
--   목록에 함께 보이고, 수량을 채우면 트리거가... **아니다**: 트리거의 해제 조건은
--   `added_reason = 'auto_threshold'` 라 수동 항목은 안 빠진다. 그래서 여기서 한 번
--   정리한다 — 이제 아무도 지울 수 없게 되므로 남겨 두면 영원히 목록에 박힌다.
-- ═════════════════════════════════════════════════════════════

drop policy if exists sl_insert on public.shopping_list;
drop policy if exists sl_delete on public.shopping_list;

-- 남아 있는 미해결 수동 항목을 닫는다. 수량이 0 인 물건이라면 트리거가 이미 자동
-- 항목을 만들어 뒀거나, 다음 0 전이 때 만든다.
update public.shopping_list
   set resolved_at = now()
 where resolved_at is null
   and added_reason = 'manual';

comment on column public.shopping_list.added_reason is
  '항상 auto_threshold. 수동 편입은 2026-09-02 에 없앴다(컬럼은 보존).';

comment on table public.shopping_list is
  '구매 리스트. 클라이언트는 **읽기만** 한다 — 편입·해제는 t40_sync_shopping_list 트리거, '
  '구매 완료는 resolve_shopping_item RPC.';
