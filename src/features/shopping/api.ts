import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * 구매 리스트 (AC16 · AC18).
 *
 * 편입과 해제는 **전부 DB 트리거가 한다** (`t40_sync_shopping_list`):
 *   · 수량이 0 으로 전이하면 편입
 *   · 0 에서 벗어나면 해제
 *
 * ⚠ 그래서 이 화면은 **읽기 전용**이다. 클라이언트가 이 표에 쓰는 길은 없고,
 *   RLS 도 select 정책 하나만 남겼다(2026-09-02 사용자 결정).
 *
 * ⚠ 목록에서 빼는 올바른 방법은 **물건을 채우는 것**(수량 올리기)이다. 행을 지우는
 *   길을 열어 두면 수량은 여전히 0 인데 목록에서만 사라져, 다음 수량 변경 때 다시
 *   들어오거나 "샀는데 왜 또 뜨지" 가 된다. 규칙은 하나다 — 0 이면 사야 한다.
 */

export type ShoppingRow = {
  id: string;
  item_id: string;
  added_at: string;
  item: {
    name: string;
    quantity: number;
    threshold: number | null;
    unit: string | null;
    thumb_path: string | null;
    purchase_url: string | null;
    location_id: string;
    container_id: string | null;
  } | null;
};

export const shoppingKeys = {
  list: (hh: string | null) => ['shopping', hh] as const,
};

/** 아직 해결되지 않은 항목만. 해결된 것은 이력이지 할 일이 아니다 */
export function useShoppingList(householdId: string | null) {
  return useQuery({
    queryKey: shoppingKeys.list(householdId),
    enabled: !!householdId,
    staleTime: 15_000,
    queryFn: async (): Promise<ShoppingRow[]> => {
      const { data, error } = await supabase
        .from('shopping_list')
        .select(
          'id, item_id, added_at, item:items!shopping_list_item_id_fkey(name, quantity, threshold, unit, thumb_path, purchase_url, location_id, container_id)',
        )
        .eq('household_id', householdId!)
        .is('resolved_at', null)
        .order('added_at', { ascending: false });
      if (error) throw error;
      // 물건이 soft delete 되면 트리거가 해제하지만, 경합으로 남는 행이 있을 수 있다
      return ((data ?? []) as ShoppingRow[]).filter((r) => !!r.item);
    },
  });
}
