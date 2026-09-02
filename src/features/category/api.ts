import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { DEFAULT_COLOR, safeIcon, type IconName } from './icons';

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
  /** 한 줄 설명. DB 기본값이 빈 문자열이라 null 이 오지 않는다 */
  description: string;
  /** 타일 바탕색 `#RRGGBB` */
  color: string;
  /** 아이콘 팩의 이름. 팩에 없는 값이 와도 `safeIcon` 이 기본 그림으로 떨어뜨린다 */
  icon: IconName;
  /** 사용자가 정한 순서. 같으면 이름순 */
  sort_order: number;
  /** 이 카테고리를 쓰는 물건 수 — 지우기 전에 영향 범위를 알아야 한다 */
  item_count: number;
};

/** 만들거나 고칠 때 화면이 넘기는 값 */
export type CategoryDraft = {
  name: string;
  description: string;
  color: string;
  icon: IconName;
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
          .select('id, name, description, color, icon, sort_order')
          .eq('household_id', householdId!)
          // ⚠ 두 단계로 정렬한다. 사용자가 순서를 안 건드린 카테고리는 sort_order 가
          //   같을 수 있는데, 그때 순서가 매번 달라지면 목록이 흔들린다.
          .order('sort_order')
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
        description: c.description ?? '',
        color: c.color ?? DEFAULT_COLOR,
        icon: safeIcon(c.icon),
        sort_order: c.sort_order ?? 0,
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
    mutationFn: async (draft: CategoryDraft) => {
      if (!householdId) throw new Error('가구를 찾을 수 없습니다.');
      /**
       * ⚠ 새 카테고리를 **맨 뒤**에 놓는다. sort_order 를 안 주면 0 이 되어 맨 앞에
       *   끼어든다 — 방금 만든 것이 목록 꼭대기에 나타나면 기존 순서가 무너진 것처럼 보인다.
       */
      const { data: last } = await supabase
        .from('categories')
        .select('sort_order')
        .eq('household_id', householdId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error } = await supabase.from('categories').insert({
        household_id: householdId,
        name: draft.name.trim(),
        description: draft.description.trim(),
        color: draft.color,
        icon: draft.icon,
        sort_order: (last?.sort_order ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: CategoryDraft & { id: string }) => {
      const { error } = await supabase
        .from('categories')
        .update({
          name: draft.name.trim(),
          description: draft.description.trim(),
          color: draft.color,
          icon: draft.icon,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/**
 * 순서 바꾸기.
 *
 * ⚠ 바뀐 행만이 아니라 **목록 전체**의 순서를 다시 적는다. 두 행만 맞바꾸면, 옛 데이터에
 *   같은 sort_order 가 섞여 있을 때 결과가 예측 불가능해진다(같은 값이면 이름순으로
 *   갈리므로 엉뚱한 자리에 앉는다). 카테고리는 많아야 수십 개라 전부 다시 적어도 싸다.
 *
 * ⚠ 한 번에 여러 행을 고치는 것이라 **하나라도 실패하면 순서가 반쯤 적용된다.**
 *   그래서 실패하면 화면이 목록을 다시 읽어 서버 상태로 되돌린다(onSettled).
 */
export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (idsInOrder: string[]) => {
      for (let i = 0; i < idsInOrder.length; i++) {
        const { error } = await supabase
          .from('categories')
          .update({ sort_order: i + 1 })
          .eq('id', idsInOrder[i]);
        if (error) throw error;
      }
    },
    onSettled: () => invalidate(qc),
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
