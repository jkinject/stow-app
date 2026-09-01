import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * 구매 리스트 (AC16 · AC18).
 *
 * 편입과 해제는 **DB 트리거가 한다** (`t40_sync_shopping_list`):
 *   · 수량이 임계치 **이하로 전이**하면 자동 편입
 *   · 임계치 **초과로 복귀**하면 자동 해제
 * 그래서 이 화면은 읽기가 대부분이고, 쓰기는 "수동 추가" 와 "수동 항목 지우기" 뿐이다.
 *
 * ⚠ 자동 항목(`auto_threshold`)은 여기서 지우지 않는다. 지워도 수량이 여전히 임계치
 *   이하라 다음 수량 변경 때 다시 들어온다. 자동 항목을 없애는 올바른 방법은
 *   **물건을 채우는 것**(수량 올리기)이고, 그러면 트리거가 알아서 해제한다.
 *   RLS 도 같은 판단이다 — delete 정책이 `added_reason = 'manual'` 로 제한돼 있다.
 */

export type ShoppingRow = {
  id: string;
  item_id: string;
  added_reason: 'auto_threshold' | 'manual';
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
          'id, item_id, added_reason, added_at, item:items!shopping_list_item_id_fkey(name, quantity, threshold, unit, thumb_path, purchase_url, location_id, container_id)',
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

/** 임계치와 무관하게 "이건 사야 해" 로 직접 넣는다 */
export function useAddToShopping(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!householdId) throw new Error('가구를 찾을 수 없습니다.');
      const { error } = await supabase
        .from('shopping_list')
        .insert({ household_id: householdId, item_id: itemId, added_reason: 'manual' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });
}

/**
 * 수동 항목을 목록에서 뺀다.
 * ⚠ 자동 항목에는 쓸 수 없다 — RLS 가 막는다. 위 주석의 이유 참조.
 */
export function useRemoveFromShopping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from('shopping_list').delete().eq('id', rowId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });
}
