import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * 카테고리 — 가구가 소유하는 독립 엔티티 (2026-08-31).
 *
 * 전에는 `items.category` 자유 문자열이었다. 목록이 없어 오타·유사 중복이 쌓였고,
 * 관리(이름 바꾸기·지우기)가 불가능했다.
 *
 * ⚠ 삭제하면 그 카테고리를 쓰던 물건의 `category_id` 가 **DB 에서** null 이 된다
 *   (`ON DELETE SET NULL`). 애플리케이션이 물건을 손대지 않는다 — 손대면 언젠가 빠뜨린다.
 */

export type Category = {
  id: string;
  name: string;
  /** 이 카테고리를 쓰는 물건 수 — 지우기 전에 영향 범위를 알아야 한다 */
  item_count: number;
};

export function useCategoryList(householdId: string | null) {
  return useQuery({
    queryKey: ['category-list', householdId],
    enabled: !!householdId,
    staleTime: 30_000,
    queryFn: async (): Promise<Category[]> => {
      const [cats, items] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name')
          .eq('household_id', householdId!)
          .order('name'),
        // 물건 수는 따로 센다. 뷰를 만들면 마이그레이션이 필요하고,
        // 카테고리는 많아야 수십 개라 클라이언트 집계로 충분하다.
        supabase
          .from('items')
          .select('category_id')
          .eq('household_id', householdId!)
          .is('deleted_at', null)
          .not('category_id', 'is', null),
      ]);
      if (cats.error) throw cats.error;
      if (items.error) throw items.error;

      const count = new Map<string, number>();
      for (const r of items.data ?? []) {
        const k = r.category_id as string | null;
        if (k) count.set(k, (count.get(k) ?? 0) + 1);
      }
      return (cats.data ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? '',
        item_count: count.get(c.id) ?? 0,
      }));
    },
  });
}

/** 카테고리가 나타나는 모든 곳을 다시 그린다 */
function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['category-list'] });
  void qc.invalidateQueries({ queryKey: ['item'] });
  void qc.invalidateQueries({ queryKey: ['items'] });
  void qc.invalidateQueries({ queryKey: ['search'] });
}

/**
 * 이름 중복은 DB 의 부분 unique 인덱스가 막는다(23505).
 * 클라이언트에서 먼저 검사하지 않는다 — 두 사람이 동시에 만들면 검사를 통과하고도 충돌한다.
 */
export function useCreateCategory(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!householdId) throw new Error('가구를 찾을 수 없습니다.');
      const { error } = await supabase
        .from('categories')
        .insert({ household_id: householdId, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRenameCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('categories')
        .update({ name: name.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/**
 * ⚠ 물건은 건드리지 않는다. 카테고리 행만 지우면 FK 의 `ON DELETE SET NULL` 이
 *   물건의 분류를 비운다. 여기서 물건을 함께 update 하면 두 곳이 같은 규칙을 갖게 되어
 *   한쪽만 고쳐지는 날이 온다.
 */
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** 중복 이름인지 판정 — 오류 코드로만 구분한다 */
export function isDuplicateName(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}
